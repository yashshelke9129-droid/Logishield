"""
LogiShield Recovery Decision Engine
====================================

Version:
    2.0.0

Purpose:
    Provide network-aware recovery recommendations for
    high-risk logistics shipments.

Major capabilities:

    1. Shipment risk analysis
    2. Route network construction
    3. Dijkstra shortest-path optimization
    4. Lowest-risk path calculation
    5. Balanced route calculation
    6. Route cost calculation
    7. Route ETA calculation
    8. Vehicle capacity analysis
    9. Vehicle replacement analysis
    10. Combined route + vehicle optimization
    11. Explainable recovery recommendations

Important:

    A recovery route is valid only when its complete
    path reaches the shipment destination.

No fake direct routes are generated.
"""

from __future__ import annotations

import heapq
import math
from typing import Any

import pandas as pd

from sqlalchemy import text


# ============================================================
# CONFIGURATION
# ============================================================

MAX_ROUTE_RESULTS = 10
MAX_VEHICLE_RESULTS = 10

MAX_PATHS_TO_RETURN = 5

# Route optimization weights.
#
# Lower final score = better route.

RISK_WEIGHT = 0.50
TIME_WEIGHT = 0.25
COST_WEIGHT = 0.15
DISTANCE_WEIGHT = 0.10


# ============================================================
# SAFE VALUE HELPERS
# ============================================================

def safe_float(
    value,
    default: float = 0.0
) -> float:

    if value is None:
        return default

    try:

        if pd.isna(value):
            return default

    except Exception:
        pass

    try:
        return float(value)

    except Exception:
        return default


def safe_int(
    value,
    default: int = 0
) -> int:

    if value is None:
        return default

    try:

        if pd.isna(value):
            return default

    except Exception:
        pass

    try:
        return int(value)

    except Exception:
        return default


def safe_string(
    value,
    default: str = "UNKNOWN"
) -> str:

    if value is None:
        return default

    try:

        if pd.isna(value):
            return default

    except Exception:
        pass

    return str(value)


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_risk(
    value: float
) -> float:

    value = safe_float(value)

    return max(
        0.0,
        min(
            value,
            100.0
        )
    )


def normalize_time(
    value: float
) -> float:

    value = safe_float(value)

    return max(
        0.0,
        min(
            value / 72.0 * 100.0,
            100.0
        )
    )


def normalize_cost(
    value: float
) -> float:

    value = safe_float(value)

    return max(
        0.0,
        min(
            value / 100000.0 * 100.0,
            100.0
        )
    )


def normalize_distance(
    value: float
) -> float:

    value = safe_float(value)

    return max(
        0.0,
        min(
            value / 3000.0 * 100.0,
            100.0
        )
    )


# ============================================================
# ROUTE EDGE SCORE
# ============================================================

def calculate_edge_score(
    route: dict[str, Any]
) -> float:

    risk = normalize_risk(
        route.get("risk_score")
    )

    time_score = normalize_time(
        route.get("estimated_time_hours")
    )

    cost_score = normalize_cost(
        route.get("base_cost")
    )

    distance_score = normalize_distance(
        route.get("distance_km")
    )

    score = (

        risk * RISK_WEIGHT

        +

        time_score * TIME_WEIGHT

        +

        cost_score * COST_WEIGHT

        +

        distance_score * DISTANCE_WEIGHT
    )

    return round(
        score,
        4
    )


# ============================================================
# LOAD SHIPMENT
# ============================================================

def get_shipment(
    connection,
    shipment_id: int
) -> dict[str, Any] | None:

    query = """
        SELECT

            s.shipment_id,
            s.shipment_code,

            s.source_location_id,
            s.destination_location_id,

            s.vehicle_id,

            s.quantity_units,
            s.weight_kg,

            s.departure_time,
            s.expected_delivery_time,

            s.weather_condition,
            s.weather_severity,

            s.traffic_level,
            s.traffic_severity,

            s.active_disruptions,
            s.max_disruption_severity,

            s.operational_risk_score,

            r.route_id,
            r.route_code,
            r.distance_km,
            r.estimated_time_hours,
            r.base_cost,
            r.risk_score,
            r.route_status,

            v.capacity_kg,
            v.vehicle_type,
            v.fuel_efficiency_km_per_litre

        FROM shipments s

        LEFT JOIN routes r
            ON r.source_location_id =
               s.source_location_id
            AND r.destination_location_id =
                s.destination_location_id

        LEFT JOIN vehicles v
            ON v.vehicle_id =
               s.vehicle_id

        WHERE
            s.shipment_id = :shipment_id

        LIMIT 1;
    """

    result = connection.execute(
        text(query),
        {
            "shipment_id": shipment_id
        }
    )

    row = result.mappings().first()

    if row is None:

        return None

    return dict(row)


# ============================================================
# LOAD COMPLETE ROUTE NETWORK
# ============================================================

def load_route_network(
    connection
) -> list[dict[str, Any]]:

    """
    Load all OPEN routes.

    Each route becomes a directed graph edge:

        source_location_id
                    |
                    v
        destination_location_id

    Example:

        21 -> 24

    The route can then be combined with:

        24 -> 7

        7 -> 16

    producing:

        21 -> 24 -> 7 -> 16
    """

    query = """
        SELECT

            route_id,
            route_code,

            source_location_id,
            destination_location_id,

            distance_km,
            estimated_time_hours,

            base_cost,
            risk_score,

            route_status

        FROM routes

        WHERE

            route_status = 'OPEN'

        ORDER BY route_id;
    """

    result = connection.execute(
        text(query)
    )

    routes = []

    for row in result.mappings():

        route = dict(row)

        route["route_id"] = safe_int(
            route.get("route_id")
        )

        route["route_code"] = safe_string(
            route.get("route_code")
        )

        route["source_location_id"] = safe_int(
            route.get(
                "source_location_id"
            )
        )

        route["destination_location_id"] = safe_int(
            route.get(
                "destination_location_id"
            )
        )

        route["distance_km"] = safe_float(
            route.get("distance_km")
        )

        route["estimated_time_hours"] = safe_float(
            route.get(
                "estimated_time_hours"
            )
        )

        route["base_cost"] = safe_float(
            route.get("base_cost")
        )

        route["risk_score"] = safe_float(
            route.get("risk_score")
        )

        route["route_status"] = safe_string(
            route.get("route_status")
        )

        route["edge_score"] = calculate_edge_score(
            route
        )

        routes.append(
            route
        )

    return routes


# ============================================================
# BUILD GRAPH
# ============================================================

def build_route_graph(
    routes: list[dict[str, Any]]
) -> dict[int, list[dict[str, Any]]]:

    """
    Convert routes into adjacency-list graph.

    Example:

        {
            21: [
                route 63,
                route 80,
                route 97
            ],

            24: [
                route 40
            ]
        }
    """

    graph: dict[
        int,
        list[dict[str, Any]]
    ] = {}

    for route in routes:

        source = safe_int(
            route[
                "source_location_id"
            ]
        )

        graph.setdefault(
            source,
            []
        )

        graph[source].append(
            route
        )

    return graph


# ============================================================
# APPLY OPERATIONAL RISK ADJUSTMENT
# ============================================================

def apply_operational_adjustment(
    route: dict[str, Any],
    shipment: dict[str, Any]
) -> dict[str, Any]:

    """
    Adjust route risk based on current shipment conditions.

    This does not change the database.

    It creates a temporary operational score.

    Factors:

        Weather
        Traffic
        Active disruptions
        Disruption severity
    """

    adjusted = dict(route)

    base_risk = safe_float(
        route.get("risk_score")
    )

    weather_severity = safe_int(
        shipment.get(
            "weather_severity"
        )
    )

    traffic_severity = safe_int(
        shipment.get(
            "traffic_severity"
        )
    )

    active_disruptions = safe_int(
        shipment.get(
            "active_disruptions"
        )
    )

    disruption_severity = safe_int(
        shipment.get(
            "max_disruption_severity"
        )
    )

    # --------------------------------------------------------
    # Weather penalty
    # --------------------------------------------------------

    weather_penalty = (
        weather_severity * 2.5
    )

    # --------------------------------------------------------
    # Traffic penalty
    # --------------------------------------------------------

    traffic_penalty = (
        traffic_severity * 2.0
    )

    # --------------------------------------------------------
    # Active disruption penalty
    # --------------------------------------------------------

    disruption_penalty = (
        active_disruptions * 3.0
    )

    # --------------------------------------------------------
    # Severe disruption penalty
    # --------------------------------------------------------

    severity_penalty = (
        disruption_severity * 2.0
    )

    adjusted_risk = (
        base_risk
        +
        weather_penalty
        +
        traffic_penalty
        +
        disruption_penalty
        +
        severity_penalty
    )

    adjusted_risk = min(
        adjusted_risk,
        100.0
    )

    adjusted[
        "adjusted_risk_score"
    ] = round(
        adjusted_risk,
        2
    )

    # Recalculate edge score.

    temporary_route = dict(
        adjusted
    )

    temporary_route[
        "risk_score"
    ] = adjusted_risk

    adjusted[
        "edge_score"
    ] = calculate_edge_score(
        temporary_route
    )

    return adjusted


# ============================================================
# DIJKSTRA SHORTEST PATH
# ============================================================

def dijkstra(
    graph: dict[int, list[dict[str, Any]]],
    start: int,
    target: int
) -> dict[str, Any] | None:

    """
    Find the lowest-score valid path.

    Returns:

        {
            "nodes": [...],
            "routes": [...],
            "score": ...
        }

    If target cannot be reached:

        None
    """

    if start == target:

        return {

            "nodes": [
                start
            ],

            "routes": [],

            "score": 0.0
        }

    queue = []

    heapq.heappush(
        queue,
        (
            0.0,
            start,
            [start],
            []
        )
    )

    best_cost: dict[
        int,
        float
    ] = {}

    while queue:

        current_cost, current_node, nodes, route_path = (
            heapq.heappop(queue)
        )

        if current_node == target:

            return {

                "nodes":
                    nodes,

                "routes":
                    route_path,

                "score":
                    round(
                        current_cost,
                        4
                    )
            }

        previous_best = best_cost.get(
            current_node
        )

        if (
            previous_best is not None
            and
            current_cost > previous_best
        ):

            continue

        best_cost[
            current_node
        ] = current_cost

        for route in graph.get(
            current_node,
            []
        ):

            next_node = safe_int(
                route[
                    "destination_location_id"
                ]
            )

            # Prevent cycles in current path.

            if next_node in nodes:

                continue

            edge_cost = safe_float(
                route[
                    "edge_score"
                ]
            )

            new_cost = (
                current_cost
                +
                edge_cost
            )

            new_nodes = (
                nodes
                +
                [next_node]
            )

            new_routes = (
                route_path
                +
                [route]
            )

            heapq.heappush(
                queue,
                (
                    new_cost,
                    next_node,
                    new_nodes,
                    new_routes
                )
            )

    return None


# ============================================================
# PATH METRICS
# ============================================================

def calculate_path_metrics(
    path: dict[str, Any]
) -> dict[str, Any]:

    routes = path.get(
        "routes",
        []
    )

    if not routes:

        return {

            "segment_count": 0,

            "distance_km": 0.0,

            "estimated_time_hours": 0.0,

            "base_cost": 0.0,

            "average_risk": 0.0,

            "maximum_risk": 0.0,

            "path_score": 0.0
        }

    distances = [
        safe_float(
            route[
                "distance_km"
            ]
        )
        for route in routes
    ]

    times = [
        safe_float(
            route[
                "estimated_time_hours"
            ]
        )
        for route in routes
    ]

    costs = [
        safe_float(
            route[
                "base_cost"
            ]
        )
        for route in routes
    ]

    risks = [
        safe_float(
            route.get(
                "adjusted_risk_score",
                route.get(
                    "risk_score"
                )
            )
        )
        for route in routes
    ]

    return {

        "segment_count":
            len(routes),

        "distance_km":
            round(
                sum(distances),
                2
            ),

        "estimated_time_hours":
            round(
                sum(times),
                2
            ),

        "base_cost":
            round(
                sum(costs),
                2
            ),

        "average_risk":
            round(
                sum(risks)
                /
                len(risks),
                2
            ),

        "maximum_risk":
            round(
                max(risks),
                2
            ),

        "path_score":
            round(
                safe_float(
                    path.get(
                        "score"
                    )
                ),
                2
            )
    }


# ============================================================
# SERIALIZE PATH
# ============================================================

def serialize_path(
    path: dict[str, Any],
    strategy: str
) -> dict[str, Any]:

    metrics = calculate_path_metrics(
        path
    )

    route_segments = []

    for index, route in enumerate(
        path.get(
            "routes",
            []
        ),
        start=1
    ):

        route_segments.append({

            "segment":
                index,

            "route_id":
                safe_int(
                    route["route_id"]
                ),

            "route_code":
                safe_string(
                    route["route_code"]
                ),

            "source_location_id":
                safe_int(
                    route[
                        "source_location_id"
                    ]
                ),

            "destination_location_id":
                safe_int(
                    route[
                        "destination_location_id"
                    ]
                ),

            "distance_km":
                round(
                    safe_float(
                        route[
                            "distance_km"
                        ]
                    ),
                    2
                ),

            "estimated_time_hours":
                round(
                    safe_float(
                        route[
                            "estimated_time_hours"
                        ]
                    ),
                    2
                ),

            "base_cost":
                round(
                    safe_float(
                        route[
                            "base_cost"
                        ]
                    ),
                    2
                ),

            "base_risk":
                round(
                    safe_float(
                        route[
                            "risk_score"
                        ]
                    ),
                    2
                ),

            "operational_risk":
                round(
                    safe_float(
                        route.get(
                            "adjusted_risk_score",
                            route.get(
                                "risk_score"
                            )
                        )
                    ),
                    2
                )
        })

    return {

        "strategy":
            strategy,

        "path":
            path.get(
                "nodes",
                []
            ),

        "route_segments":
            route_segments,

        "metrics":
            metrics,

        "destination_reached":
            len(
                path.get(
                    "nodes",
                    []
                )
            ) > 0
    }


# ============================================================
# FIND RECOVERY PATHS
# ============================================================

def find_recovery_paths(
    routes: list[dict[str, Any]],
    shipment: dict[str, Any]
) -> list[dict[str, Any]]:

    """
    Find valid origin -> destination paths.

    This is the critical difference from the previous engine.

    We DO NOT return:

        origin -> unrelated destination

    We only return:

        origin -> ... -> actual destination
    """

    source = safe_int(
        shipment[
            "source_location_id"
        ]
    )

    destination = safe_int(
        shipment[
            "destination_location_id"
        ]
    )

    adjusted_routes = []

    for route in routes:

        adjusted_routes.append(
            apply_operational_adjustment(
                route,
                shipment
            )
        )

    graph = build_route_graph(
        adjusted_routes
    )

    paths = []

    # --------------------------------------------------------
    # Best balanced path
    # --------------------------------------------------------

    balanced = dijkstra(
        graph,
        source,
        destination
    )

    if balanced is not None:

        paths.append(
            serialize_path(
                balanced,
                "BALANCED_OPTIMIZATION"
            )
        )

    # --------------------------------------------------------
    # Lowest-risk path
    #
    # Build a temporary graph whose edge cost is
    # primarily operational risk.
    # --------------------------------------------------------

    risk_graph: dict[
        int,
        list[dict[str, Any]]
    ] = {}

    for route in adjusted_routes:

        risk_route = dict(
            route
        )

        risk_route[
            "edge_score"
        ] = safe_float(
            route.get(
                "adjusted_risk_score",
                route.get(
                    "risk_score"
                )
            )
        )

        source_id = safe_int(
            route[
                "source_location_id"
            ]
        )

        risk_graph.setdefault(
            source_id,
            []
        ).append(
            risk_route
        )

    lowest_risk = dijkstra(
        risk_graph,
        source,
        destination
    )

    if lowest_risk is not None:

        serialized = serialize_path(
            lowest_risk,
            "LOWEST_RISK"
        )

        # Avoid duplicate route sequence.

        existing_paths = {
            tuple(
                item[
                    "path"
                ]
            )
            for item in paths
        }

        if tuple(
            serialized["path"]
        ) not in existing_paths:

            paths.append(
                serialized
            )

    # --------------------------------------------------------
    # Lowest-time path
    # --------------------------------------------------------

    time_graph: dict[
        int,
        list[dict[str, Any]]
    ] = {}

    for route in adjusted_routes:

        time_route = dict(
            route
        )

        time_route[
            "edge_score"
        ] = safe_float(
            route[
                "estimated_time_hours"
            ]
        )

        source_id = safe_int(
            route[
                "source_location_id"
            ]
        )

        time_graph.setdefault(
            source_id,
            []
        ).append(
            time_route
        )

    fastest = dijkstra(
        time_graph,
        source,
        destination
    )

    if fastest is not None:

        serialized = serialize_path(
            fastest,
            "FASTEST_ROUTE"
        )

        existing_paths = {
            tuple(
                item[
                    "path"
                ]
            )
            for item in paths
        }

        if tuple(
            serialized["path"]
        ) not in existing_paths:

            paths.append(
                serialized
            )

    # --------------------------------------------------------
    # Sort by path score
    # --------------------------------------------------------

    paths.sort(
        key=lambda item:
            safe_float(
                item[
                    "metrics"
                ][
                    "path_score"
                ],
                999999
            )
    )

    return paths[
        :MAX_PATHS_TO_RETURN
    ]


# ============================================================
# FIND AVAILABLE VEHICLES
# ============================================================

def find_available_vehicles(
    connection,
    shipment: dict[str, Any]
) -> list[dict[str, Any]]:

    """
    Find vehicles capable of carrying the shipment.

    Uses only columns that exist in the LogiShield
    vehicles table.
    """

    weight_kg = safe_float(
        shipment[
            "weight_kg"
        ]
    )

    current_vehicle_id = safe_int(
        shipment[
            "vehicle_id"
        ]
    )

    query = """
        SELECT

            vehicle_id,
            vehicle_type,
            capacity_kg,
            fuel_efficiency_km_per_litre,
            status

        FROM vehicles

        WHERE

            vehicle_id != :current_vehicle_id

            AND

            capacity_kg >= :weight_kg

            AND

            (
                status IS NULL

                OR

                (
                    UPPER(status::text)
                    NOT LIKE '%MAINT%'

                    AND

                    UPPER(status::text)
                    NOT LIKE '%REPAIR%'

                    AND

                    UPPER(status::text)
                    NOT LIKE '%INACTIVE%'

                    AND

                    UPPER(status::text)
                    NOT LIKE '%OUT_OF_SERVICE%'

                    AND

                    UPPER(status::text)
                    NOT LIKE '%OUT OF SERVICE%'

                    AND

                    UPPER(status::text)
                    NOT LIKE '%IN_TRANSIT%'

                    AND

                    UPPER(status::text)
                    NOT LIKE '%IN TRANSIT%'
                )
            )

        ORDER BY
            capacity_kg ASC

        LIMIT :limit;
    """

    result = connection.execute(
        text(query),
        {
            "weight_kg":
                weight_kg,

            "current_vehicle_id":
                current_vehicle_id,

            "limit":
                MAX_VEHICLE_RESULTS
        }
    )

    vehicles = []

    for row in result.mappings():

        vehicle = dict(
            row
        )

        vehicle[
            "vehicle_id"
        ] = safe_int(
            vehicle.get(
                "vehicle_id"
            )
        )

        vehicle[
            "vehicle_type"
        ] = safe_string(
            vehicle.get(
                "vehicle_type"
            )
        )

        vehicle[
            "capacity_kg"
        ] = safe_float(
            vehicle.get(
                "capacity_kg"
            )
        )

        vehicle[
            "fuel_efficiency_km_per_litre"
        ] = safe_float(
            vehicle.get(
                "fuel_efficiency_km_per_litre"
            )
        )

        vehicle[
            "status"
        ] = safe_string(
            vehicle.get(
                "status"
            )
        )

        vehicles.append(
            vehicle
        )

    return vehicles


# ============================================================
# VEHICLE SCORING
# ============================================================

def calculate_vehicle_score(
    weight_kg: float,
    capacity_kg: float,
    fuel_efficiency: float
) -> tuple[float, float]:

    if capacity_kg <= 0:

        return (
            999.0,
            999.0
        )

    utilization = (
        weight_kg
        /
        capacity_kg
        *
        100.0
    )

    # --------------------------------------------------------
    # Capacity utilization
    # --------------------------------------------------------

    if utilization > 100:

        utilization_penalty = (
            100.0
            +
            (
                utilization
                -
                100.0
            )
            * 5.0
        )

    elif utilization > 90:

        utilization_penalty = (
            70.0
            +
            (
                utilization
                -
                90.0
            )
            * 3.0
        )

    elif utilization >= 50:

        utilization_penalty = (
            100.0
            -
            utilization
        )

    else:

        utilization_penalty = (
            50.0
            -
            utilization / 2.0
        )

    # --------------------------------------------------------
    # Fuel efficiency
    # --------------------------------------------------------

    fuel_penalty = 0.0

    if fuel_efficiency > 0:

        fuel_penalty = (
            20.0
            /
            fuel_efficiency
        )

    vehicle_score = (
        utilization_penalty
        +
        fuel_penalty
    )

    return (

        round(
            utilization,
            2
        ),

        round(
            vehicle_score,
            2
        )
    )


def score_vehicles(
    vehicles: list[dict[str, Any]],
    weight_kg: float
) -> list[dict[str, Any]]:

    scored = []

    for vehicle in vehicles:

        capacity = safe_float(
            vehicle[
                "capacity_kg"
            ]
        )

        fuel_efficiency = safe_float(
            vehicle[
                "fuel_efficiency_km_per_litre"
            ]
        )

        utilization, score = (
            calculate_vehicle_score(
                weight_kg,
                capacity,
                fuel_efficiency
            )
        )

        item = dict(
            vehicle
        )

        item[
            "utilization_percentage"
        ] = utilization

        item[
            "vehicle_score"
        ] = score

        scored.append(
            item
        )

    scored.sort(
        key=lambda item:
            safe_float(
                item[
                    "vehicle_score"
                ],
                999999
            )
    )

    return scored


# ============================================================
# COMBINED RECOVERY SCORING
# ============================================================

def calculate_combined_score(
    path: dict[str, Any],
    vehicle: dict[str, Any]
) -> float:

    metrics = path[
        "metrics"
    ]

    route_score = safe_float(
        metrics[
            "path_score"
        ]
    )

    vehicle_score = safe_float(
        vehicle[
            "vehicle_score"
        ]
    )

    return round(
        (
            route_score * 0.70
        )
        +
        (
            vehicle_score * 0.30
        ),
        2
    )


# ============================================================
# BUILD RECOVERY OPTIONS
# ============================================================

def build_recovery_options(
    shipment: dict[str, Any],
    paths: list[dict[str, Any]],
    vehicles: list[dict[str, Any]]
) -> list[dict[str, Any]]:

    options = []

    current_route_id = safe_int(
        shipment[
            "route_id"
        ]
    )

    current_vehicle_id = safe_int(
        shipment[
            "vehicle_id"
        ]
    )

    current_route = {

        "route_id":
            current_route_id,

        "route_code":
            safe_string(
                shipment[
                    "route_code"
                ]
            ),

        "distance_km":
            safe_float(
                shipment[
                    "distance_km"
                ]
            ),

        "estimated_time_hours":
            safe_float(
                shipment[
                    "estimated_time_hours"
                ]
            ),

        "base_cost":
            safe_float(
                shipment[
                    "base_cost"
                ]
            ),

        "risk_score":
            safe_float(
                shipment[
                    "risk_score"
                ]
            )
    }

    current_route_score = calculate_edge_score(
        current_route
    )

    # --------------------------------------------------------
    # Current operation
    # --------------------------------------------------------

    options.append({

        "strategy":
            "CONTINUE_CURRENT_ROUTE",

        "route_id":
            current_route_id,

        "route_code":
            safe_string(
                shipment[
                    "route_code"
                ]
            ),

        "vehicle_id":
            current_vehicle_id,

        "recovery_score":
            round(
                current_route_score,
                2
            ),

        "destination_reached":
            True,

        "reason":
            "Continue current route if operational conditions remain manageable."
    })

    # --------------------------------------------------------
    # Valid route alternatives
    # --------------------------------------------------------

    for path in paths:

        metrics = path[
            "metrics"
        ]

        options.append({

            "strategy":
                "SWITCH_ROUTE",

            "route_strategy":
                path[
                    "strategy"
                ],

            "route_path":
                path[
                    "path"
                ],

            "route_segments":
                path[
                    "route_segments"
                ],

            "vehicle_id":
                current_vehicle_id,

            "recovery_score":
                safe_float(
                    metrics[
                        "path_score"
                    ]
                ),

            "distance_km":
                safe_float(
                    metrics[
                        "distance_km"
                    ]
                ),

            "estimated_time_hours":
                safe_float(
                    metrics[
                        "estimated_time_hours"
                    ]
                ),

            "base_cost":
                safe_float(
                    metrics[
                        "base_cost"
                    ]
                ),

            "average_risk":
                safe_float(
                    metrics[
                        "average_risk"
                    ]
                ),

            "maximum_risk":
                safe_float(
                    metrics[
                        "maximum_risk"
                    ]
                ),

            "segment_count":
                safe_int(
                    metrics[
                        "segment_count"
                    ]
                ),

            "destination_reached":
                True,

            "reason":
                "A complete origin-to-destination recovery path was found."
        })

    # --------------------------------------------------------
    # Alternative vehicles
    # --------------------------------------------------------

    for vehicle in vehicles:

        options.append({

            "strategy":
                "SWITCH_VEHICLE",

            "vehicle_id":
                safe_int(
                    vehicle[
                        "vehicle_id"
                    ]
                ),

            "vehicle_type":
                safe_string(
                    vehicle[
                        "vehicle_type"
                    ]
                ),

            "utilization_percentage":
                safe_float(
                    vehicle[
                        "utilization_percentage"
                    ]
                ),

            "recovery_score":
                round(
                    (
                        current_route_score
                        * 0.65
                    )
                    +
                    (
                        safe_float(
                            vehicle[
                                "vehicle_score"
                            ]
                        )
                        * 0.35
                    ),
                    2
                ),

            "destination_reached":
                True,

            "reason":
                "Alternative vehicle has sufficient capacity."
        })

    # --------------------------------------------------------
    # Combined route + vehicle
    # --------------------------------------------------------

    for path in paths:

        for vehicle in vehicles:

            combined_score = (
                calculate_combined_score(
                    path,
                    vehicle
                )
            )

            metrics = path[
                "metrics"
            ]

            options.append({

                "strategy":
                    "SWITCH_ROUTE_AND_VEHICLE",

                "route_strategy":
                    path[
                        "strategy"
                    ],

                "route_path":
                    path[
                        "path"
                    ],

                "route_segments":
                    path[
                        "route_segments"
                    ],

                "vehicle_id":
                    safe_int(
                        vehicle[
                            "vehicle_id"
                        ]
                    ),

                "vehicle_type":
                    safe_string(
                        vehicle[
                            "vehicle_type"
                        ]
                    ),

                "utilization_percentage":
                    safe_float(
                        vehicle[
                            "utilization_percentage"
                        ]
                    ),

                "recovery_score":
                    combined_score,

                "distance_km":
                    safe_float(
                        metrics[
                            "distance_km"
                        ]
                    ),

                "estimated_time_hours":
                    safe_float(
                        metrics[
                            "estimated_time_hours"
                        ]
                    ),

                "base_cost":
                    safe_float(
                        metrics[
                            "base_cost"
                        ]
                    ),

                "average_risk":
                    safe_float(
                        metrics[
                            "average_risk"
                        ]
                    ),

                "maximum_risk":
                    safe_float(
                        metrics[
                            "maximum_risk"
                        ]
                    ),

                "destination_reached":
                    True,

                "reason":
                    "Combined route and vehicle optimization."
            })

    options.sort(
        key=lambda item:
            safe_float(
                item[
                    "recovery_score"
                ],
                999999
            )
    )

    return options


# ============================================================
# EXPLANATION ENGINE
# ============================================================

def generate_explanation(
    shipment: dict[str, Any],
    best_option: dict[str, Any],
    delay_probability: float
) -> list[str]:

    explanations = []

    weather = safe_string(
        shipment[
            "weather_condition"
        ]
    )

    traffic = safe_string(
        shipment[
            "traffic_level"
        ]
    )

    disruptions = safe_int(
        shipment[
            "active_disruptions"
        ]
    )

    disruption_severity = safe_int(
        shipment[
            "max_disruption_severity"
        ]
    )

    operational_risk = safe_float(
        shipment[
            "operational_risk_score"
        ]
    )

    # --------------------------------------------------------
    # ML risk
    # --------------------------------------------------------

    if delay_probability >= 0.75:

        explanations.append(
            "Shipment has critical predicted delay risk."
        )

    elif delay_probability >= 0.50:

        explanations.append(
            "Shipment has high predicted delay risk."
        )

    elif delay_probability >= 0.25:

        explanations.append(
            "Shipment has moderate predicted delay risk."
        )

    else:

        explanations.append(
            "Shipment currently has relatively low predicted delay risk."
        )

    # --------------------------------------------------------
    # Weather
    # --------------------------------------------------------

    if weather not in (
        "CLEAR",
        "UNKNOWN"
    ):

        explanations.append(
            f"Weather condition is {weather}."
        )

    # --------------------------------------------------------
    # Traffic
    # --------------------------------------------------------

    if traffic not in (
        "LOW",
        "NORMAL",
        "UNKNOWN"
    ):

        explanations.append(
            f"Traffic condition is {traffic}."
        )

    # --------------------------------------------------------
    # Disruptions
    # --------------------------------------------------------

    if disruptions > 0:

        explanations.append(
            f"{disruptions} active disruption(s) affect the shipment."
        )

    if disruption_severity >= 4:

        explanations.append(
            "At least one high-severity disruption is active."
        )

    # --------------------------------------------------------
    # Operational risk
    # --------------------------------------------------------

    if operational_risk >= 50:

        explanations.append(
            "Operational risk score is elevated."
        )

    # --------------------------------------------------------
    # Recovery decision
    # --------------------------------------------------------

    strategy = best_option[
        "strategy"
    ]

    if strategy == "SWITCH_ROUTE":

        explanations.append(
            "A complete origin-to-destination alternative route "
            "has been identified."
        )

        explanations.append(
            "The recommended route improves the overall "
            "recovery score."
        )

    elif strategy == "SWITCH_VEHICLE":

        explanations.append(
            "A different vehicle provides a better capacity "
            "configuration."
        )

    elif strategy == "SWITCH_ROUTE_AND_VEHICLE":

        explanations.append(
            "Changing both route and vehicle provides the "
            "best combined recovery score."
        )

    else:

        explanations.append(
            "No superior complete recovery path was found. "
            "Continue the current operation with monitoring."
        )

    return explanations


# ============================================================
# MAIN ANALYSIS FUNCTION
# ============================================================

def analyze_shipment(
    engine,
    shipment_id: int,
    delay_probability: float | None = None
) -> dict[str, Any]:

    """
    Complete recovery analysis.

    Called by:

        /api/v1/recovery/shipment/{shipment_id}
    """

    # ========================================================
    # DATABASE
    # ========================================================

    with engine.connect() as connection:

        shipment = get_shipment(
            connection,
            shipment_id
        )

        if shipment is None:

            raise ValueError(
                f"Shipment {shipment_id} not found."
            )

        # ----------------------------------------------------
        # Load all routes
        # ----------------------------------------------------

        routes = load_route_network(
            connection
        )

        # ----------------------------------------------------
        # Find available vehicles
        # ----------------------------------------------------

        vehicles = find_available_vehicles(
            connection,
            shipment
        )

    # ========================================================
    # RECOVERY PATHS
    # ========================================================

    recovery_paths = find_recovery_paths(
        routes,
        shipment
    )

    # ========================================================
    # VEHICLES
    # ========================================================

    weight_kg = safe_float(
        shipment[
            "weight_kg"
        ]
    )

    scored_vehicles = score_vehicles(
        vehicles,
        weight_kg
    )

    # ========================================================
    # DELAY PROBABILITY
    # ========================================================

    if delay_probability is None:

        delay_probability = safe_float(
            shipment.get(
                "delay_probability_simulated",
                0
            )
        )

    delay_probability = max(
        0.0,
        min(
            delay_probability,
            1.0
        )
    )

    # ========================================================
    # INTERVENTION LEVEL
    # ========================================================

    if delay_probability >= 0.75:

        intervention = (
            "IMMEDIATE_INTERVENTION"
        )

    elif delay_probability >= 0.50:

        intervention = (
            "HIGH_PRIORITY"
        )

    elif delay_probability >= 0.25:

        intervention = (
            "MONITOR"
        )

    else:

        intervention = (
            "NORMAL_OPERATION"
        )

    # ========================================================
    # BUILD OPTIONS
    # ========================================================

    options = build_recovery_options(
        shipment,
        recovery_paths,
        scored_vehicles
    )

    # ========================================================
    # IMPORTANT:
    #
    # Prefer valid complete paths over merely changing
    # vehicles when the shipment is critical.
    # ========================================================

    if delay_probability >= 0.75:

        valid_path_options = [

            option

            for option in options

            if option.get(
                "destination_reached",
                False
            )

            and option[
                "strategy"
            ] in (
                "SWITCH_ROUTE",
                "SWITCH_ROUTE_AND_VEHICLE"
            )
        ]

        if valid_path_options:

            valid_path_options.sort(
                key=lambda item:
                    safe_float(
                        item[
                            "recovery_score"
                        ],
                        999999
                    )
            )

            best_option = (
                valid_path_options[0]
            )

        else:

            best_option = options[0]

    else:

        best_option = options[0]

    # ========================================================
    # EXPLANATION
    # ========================================================

    explanation = generate_explanation(
        shipment,
        best_option,
        delay_probability
    )

    # ========================================================
    # CURRENT ROUTE
    # ========================================================

    current_route = {

        "route_id":
            safe_int(
                shipment[
                    "route_id"
                ]
            ),

        "route_code":
            safe_string(
                shipment[
                    "route_code"
                ]
            ),

        "distance_km":
            safe_float(
                shipment[
                    "distance_km"
                ]
            ),

        "estimated_time_hours":
            safe_float(
                shipment[
                    "estimated_time_hours"
                ]
            ),

        "base_cost":
            safe_float(
                shipment[
                    "base_cost"
                ]
            ),

        "risk_score":
            safe_float(
                shipment[
                    "risk_score"
                ]
            ),

        "status":
            safe_string(
                shipment[
                    "route_status"
                ]
            )
    }

    # ========================================================
    # RETURN
    # ========================================================

    return {

        "system":
            "LogiShield",

        "engine":
            "Recovery Decision Engine",

        "version":
            "2.0.0",

        "optimization":
            "NETWORK_AWARE_DIJKSTRA",

        "shipment": {

            "shipment_id":
                safe_int(
                    shipment[
                        "shipment_id"
                    ]
                ),

            "shipment_code":
                safe_string(
                    shipment[
                        "shipment_code"
                    ]
                ),

            "source_location_id":
                safe_int(
                    shipment[
                        "source_location_id"
                    ]
                ),

            "destination_location_id":
                safe_int(
                    shipment[
                        "destination_location_id"
                    ]
                ),

            "weight_kg":
                weight_kg,

            "current_vehicle_id":
                safe_int(
                    shipment[
                        "vehicle_id"
                    ]
                ),

            "current_route_id":
                safe_int(
                    shipment[
                        "route_id"
                    ]
                )
        },

        "risk": {

            "delay_probability":
                round(
                    delay_probability,
                    4
                ),

            "delay_probability_percentage":
                round(
                    delay_probability * 100,
                    2
                ),

            "intervention":
                intervention,

            "weather":
                safe_string(
                    shipment[
                        "weather_condition"
                    ]
                ),

            "traffic":
                safe_string(
                    shipment[
                        "traffic_level"
                    ]
                ),

            "active_disruptions":
                safe_int(
                    shipment[
                        "active_disruptions"
                    ]
                ),

            "maximum_disruption_severity":
                safe_int(
                    shipment[
                        "max_disruption_severity"
                    ]
                ),

            "operational_risk":
                safe_float(
                    shipment[
                        "operational_risk_score"
                    ]
                )
        },

        "current_route":
            current_route,

        "recovery_paths":
            recovery_paths,

        "alternative_vehicles":
            scored_vehicles,

        "recommended_recovery":
            best_option,

        "explanation":
            explanation,

        "network_statistics": {

            "total_open_routes":
                len(
                    routes
                ),

            "valid_recovery_paths":
                len(
                    recovery_paths
                ),

            "available_vehicles":
                len(
                    scored_vehicles
                )
        },

        "option_count":
            len(
                options
            )
    }