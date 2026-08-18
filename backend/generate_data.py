"""
LogiShield - Complete Logistics Data Generator
===============================================

Generates a realistic India-based logistics dataset and loads it
into the existing PostgreSQL "logishield" database.

Run:
    python generate_data.py

Important:
    This script clears the existing data in the 12 LogiShield tables
    before generating a fresh reproducible dataset.
"""

from __future__ import annotations

import math
import os
import random
import sys
import time
from datetime import date, datetime, timedelta

import numpy as np
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values


# ============================================================
# CONFIGURATION
# ============================================================

SEED = 42

NUM_LOCATIONS = 30
NUM_WAREHOUSES = 10
NUM_PRODUCTS = 20
NUM_VEHICLES = 100
NUM_ROUTES = 120
NUM_SHIPMENTS = 100_000
DEMAND_DAYS = 365
NUM_DISRUPTIONS = 3_000

START_DATE = date(2025, 8, 15)
BATCH_SIZE = 5_000

random.seed(SEED)
np.random.seed(SEED)

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "logishield")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD")


# ============================================================
# INDIAN LOCATIONS
# ============================================================

LOCATIONS = [
    ("Mumbai Central", "Mumbai", "Maharashtra", 19.0760, 72.8777),
    ("Pune Hub", "Pune", "Maharashtra", 18.5204, 73.8567),
    ("Nashik Hub", "Nashik", "Maharashtra", 19.9975, 73.7898),
    ("Nagpur Hub", "Nagpur", "Maharashtra", 21.1458, 79.0882),
    ("Aurangabad Hub", "Aurangabad", "Maharashtra", 19.8762, 75.3433),
    ("Ahmedabad Hub", "Ahmedabad", "Gujarat", 23.0225, 72.5714),
    ("Surat Hub", "Surat", "Gujarat", 21.1702, 72.8311),
    ("Vadodara Hub", "Vadodara", "Gujarat", 22.3072, 73.1812),
    ("Delhi NCR Hub", "Delhi", "Delhi", 28.6139, 77.2090),
    ("Jaipur Hub", "Jaipur", "Rajasthan", 26.9124, 75.7873),
    ("Chandigarh Hub", "Chandigarh", "Chandigarh", 30.7333, 76.7794),
    ("Lucknow Hub", "Lucknow", "Uttar Pradesh", 26.8467, 80.9462),
    ("Kanpur Hub", "Kanpur", "Uttar Pradesh", 26.4499, 80.3319),
    ("Varanasi Hub", "Varanasi", "Uttar Pradesh", 25.3176, 82.9739),
    ("Kolkata Hub", "Kolkata", "West Bengal", 22.5726, 88.3639),
    ("Bhubaneswar Hub", "Bhubaneswar", "Odisha", 20.2961, 85.8245),
    ("Guwahati Hub", "Guwahati", "Assam", 26.1445, 91.7362),
    ("Hyderabad Hub", "Hyderabad", "Telangana", 17.3850, 78.4867),
    ("Bengaluru Hub", "Bengaluru", "Karnataka", 12.9716, 77.5946),
    ("Chennai Hub", "Chennai", "Tamil Nadu", 13.0827, 80.2707),
    ("Coimbatore Hub", "Coimbatore", "Tamil Nadu", 11.0168, 76.9558),
    ("Kochi Hub", "Kochi", "Kerala", 9.9312, 76.2673),
    ("Visakhapatnam Hub", "Visakhapatnam", "Andhra Pradesh", 17.6868, 83.2185),
    ("Vijayawada Hub", "Vijayawada", "Andhra Pradesh", 16.5062, 80.6480),
    ("Bhopal Hub", "Bhopal", "Madhya Pradesh", 23.2599, 77.4126),
    ("Indore Hub", "Indore", "Madhya Pradesh", 22.7196, 75.8577),
    ("Patna Hub", "Patna", "Bihar", 25.5941, 85.1376),
    ("Ranchi Hub", "Ranchi", "Jharkhand", 23.3441, 85.3096),
    ("Raipur Hub", "Raipur", "Chhattisgarh", 21.2514, 81.6296),
    ("Goa Hub", "Panaji", "Goa", 15.4909, 73.8278),
]


# ============================================================
# PRODUCTS
# ============================================================

PRODUCT_DEFINITIONS = [
    ("Smartphone", "Electronics", 0.35, 25000),
    ("Laptop", "Electronics", 2.20, 65000),
    ("Television", "Electronics", 12.00, 45000),
    ("Tablet", "Electronics", 0.70, 22000),
    ("Headphones", "Electronics", 0.25, 3500),
    ("Refrigerator", "Appliances", 55.00, 55000),
    ("Washing Machine", "Appliances", 62.00, 48000),
    ("Microwave", "Appliances", 15.00, 14000),
    ("Brake Parts", "Automotive", 4.00, 8500),
    ("Engine Components", "Automotive", 8.00, 18000),
    ("Tyres", "Automotive", 11.00, 9000),
    ("Medicines", "Pharma", 0.10, 1200),
    ("Medical Devices", "Pharma", 2.00, 15000),
    ("Packaged Food", "Food", 0.50, 450),
    ("Beverages", "Food", 1.00, 180),
    ("Cotton Fabric", "Textiles", 5.00, 2500),
    ("Garments", "Textiles", 0.60, 1200),
    ("Steel Components", "Industrial", 20.00, 35000),
    ("Electrical Equipment", "Industrial", 8.00, 22000),
    ("Fertilizer", "Agriculture", 25.00, 1800),
]


# ============================================================
# VEHICLES / DISRUPTIONS
# ============================================================

VEHICLE_TYPES = [
    ("Mini Truck", 5000, 8.0),
    ("Light Truck", 10000, 7.0),
    ("Medium Truck", 18000, 5.5),
    ("Heavy Truck", 30000, 4.5),
]

DISRUPTION_TYPES = [
    ("HEAVY_RAIN", 0.18),
    ("FLOOD", 0.08),
    ("TRAFFIC_CONGESTION", 0.22),
    ("ROAD_CLOSURE", 0.12),
    ("VEHICLE_BREAKDOWN", 0.15),
    ("WAREHOUSE_FAILURE", 0.07),
    ("SUPPLIER_DELAY", 0.10),
    ("LABOUR_SHORTAGE", 0.05),
    ("CYCLONE", 0.03),
]


# ============================================================
# HELPERS
# ============================================================

def header(title: str) -> None:
    print()
    print("=" * 70)
    print(title)
    print("=" * 70)


def progress(current: int, total: int, label: str) -> None:
    step = max(1, total // 20)
    if current == total or current % step == 0:
        pct = current / total * 100
        print(f"{label}: {current:,}/{total:,} ({pct:5.1f}%)")


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    radius = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)

    a = (
        math.sin(dp / 2) ** 2
        + math.cos(p1)
        * math.cos(p2)
        * math.sin(dl / 2) ** 2
    )

    return radius * 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a),
    )


def weighted_pair(options):
    """
    Correctly returns the complete (value, multiplier) pair.

    This is the bug fix for the previous generator:
    the old helper returned only the value string, so code such as

        weather, factor = weather_condition(...)

    attempted to unpack characters from a string.
    """
    values = [x[0] for x in options]
    weights = [x[1] for x in options]
    index = random.choices(
        range(len(options)),
        weights=weights,
        k=1,
    )[0]
    return values[index], options[index][1]


def seasonal_factor(current_date: date) -> float:
    month = current_date.month

    if month in (10, 11):
        return 1.25

    if month in (4, 5, 6):
        return 1.10

    if month in (12, 1, 2):
        return 0.95

    return 1.00


def weather_condition(current_date: date) -> tuple[str, float]:
    """
    Returns:
        weather_name, weather_multiplier
    """
    month = current_date.month

    if month in (6, 7, 8, 9):
        options = [
            ("CLEAR", 0.80),
            ("CLOUDY", 0.95),
            ("HEAVY_RAIN", 1.35),
            ("STORM", 1.60),
        ]
    else:
        options = [
            ("CLEAR", 0.80),
            ("CLOUDY", 0.95),
            ("LIGHT_RAIN", 1.05),
            ("HEAVY_RAIN", 1.25),
        ]

    return weighted_pair(options)


def traffic_condition() -> tuple[str, float]:
    """
    Returns:
        traffic_level, traffic_multiplier
    """
    options = [
        ("LOW", 0.80),
        ("NORMAL", 1.00),
        ("HIGH", 1.25),
        ("SEVERE", 1.55),
    ]

    return weighted_pair(options)


def risk_level(score: float) -> str:
    if score >= 75:
        return "CRITICAL"
    if score >= 55:
        return "HIGH"
    if score >= 30:
        return "MEDIUM"
    return "LOW"


def batch_insert(cursor, query: str, rows: list[tuple]) -> None:
    for start in range(0, len(rows), BATCH_SIZE):
        batch = rows[start:start + BATCH_SIZE]
        execute_values(
            cursor,
            query,
            batch,
            page_size=len(batch),
        )


# ============================================================
# DATABASE
# ============================================================

def connect():
    if not DB_PASSWORD:
        print("ERROR: DB_PASSWORD is missing from .env")
        print()
        print("Expected file:")
        print(r"C:\LogiShield\backend\.env")
        sys.exit(1)

    try:
        return psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
        )
    except Exception as exc:
        print("=" * 70)
        print("DATABASE CONNECTION FAILED")
        print("=" * 70)
        print(exc)
        sys.exit(1)


def clear_database(cursor) -> None:
    header("CLEARING EXISTING LOGISHIELD DATA")

    tables = [
        "alerts",
        "recovery_plans",
        "shipment_risk_predictions",
        "disruptions",
        "shipments",
        "demand_history",
        "inventory",
        "routes",
        "vehicles",
        "products",
        "warehouses",
        "locations",
    ]

    for table in tables:
        cursor.execute(
            f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE;"
        )

    print("Existing project data cleared.")


# ============================================================
# LOCATIONS
# ============================================================

def generate_locations(cursor):
    header("1/12 GENERATING LOCATIONS")

    query = """
        INSERT INTO locations
            (name, city, state, country, latitude, longitude)
        VALUES %s;
    """

    rows = [
        (
            name,
            city,
            state,
            "India",
            latitude,
            longitude,
        )
        for name, city, state, latitude, longitude in LOCATIONS
    ]

    execute_values(cursor, query, rows)

    cursor.execute("""
        SELECT location_id, name, city, state, latitude, longitude
        FROM locations
        ORDER BY location_id;
    """)

    result = []
    for row in cursor.fetchall():
        result.append({
            "location_id": row[0],
            "name": row[1],
            "city": row[2],
            "state": row[3],
            "latitude": float(row[4]),
            "longitude": float(row[5]),
        })

    print(f"Generated {len(result)} locations.")
    return result


# ============================================================
# WAREHOUSES
# ============================================================

def generate_warehouses(cursor, locations):
    header("2/12 GENERATING WAREHOUSES")

    rows = []

    for index, location in enumerate(
        locations[:NUM_WAREHOUSES],
        start=1,
    ):
        rows.append((
            f"WH-{index:03d}",
            f"LogiShield {location['city']} Distribution Center",
            location["location_id"],
            random.randint(50_000, 250_000),
            "OPERATIONAL",
        ))

    query = """
        INSERT INTO warehouses
            (warehouse_code, name, location_id,
             capacity_units, current_status)
        VALUES %s;
    """

    execute_values(cursor, query, rows)

    cursor.execute("""
        SELECT warehouse_id, warehouse_code, name,
               location_id, capacity_units, current_status
        FROM warehouses
        ORDER BY warehouse_id;
    """)

    result = []
    for row in cursor.fetchall():
        result.append({
            "warehouse_id": row[0],
            "warehouse_code": row[1],
            "name": row[2],
            "location_id": row[3],
            "capacity_units": row[4],
            "status": row[5],
        })

    print(f"Generated {len(result)} warehouses.")
    return result


# ============================================================
# PRODUCTS
# ============================================================

def generate_products(cursor):
    header("3/12 GENERATING PRODUCTS")

    rows = []

    for index, (name, category, weight, price) in enumerate(
        PRODUCT_DEFINITIONS,
        start=1,
    ):
        rows.append((
            f"P-{index:03d}",
            name,
            category,
            weight,
            price,
        ))

    query = """
        INSERT INTO products
            (product_code, product_name, category,
             unit_weight_kg, unit_price)
        VALUES %s;
    """

    execute_values(cursor, query, rows)

    cursor.execute("""
        SELECT product_id, product_code, product_name,
               category, unit_weight_kg, unit_price
        FROM products
        ORDER BY product_id;
    """)

    result = []

    for row in cursor.fetchall():
        result.append({
            "product_id": row[0],
            "product_code": row[1],
            "product_name": row[2],
            "category": row[3],
            "weight": float(row[4]),
            "price": float(row[5]),
        })

    print(f"Generated {len(result)} products.")
    return result


# ============================================================
# VEHICLES
# ============================================================

def generate_vehicles(cursor, locations):
    header("4/12 GENERATING VEHICLES")

    rows = []

    for index in range(1, NUM_VEHICLES + 1):
        vehicle_type, capacity, efficiency = random.choice(
            VEHICLE_TYPES
        )

        location = random.choice(locations)

        maintenance_date = (
            date.today()
            + timedelta(days=random.randint(10, 180))
        )

        rows.append((
            f"VH-{index:04d}",
            vehicle_type,
            capacity,
            efficiency,
            location["location_id"],
            "AVAILABLE",
            maintenance_date,
        ))

    query = """
        INSERT INTO vehicles
            (vehicle_code, vehicle_type, capacity_kg,
             fuel_efficiency_km_per_litre,
             current_location_id, status,
             maintenance_due_date)
        VALUES %s;
    """

    execute_values(cursor, query, rows)

    cursor.execute("""
        SELECT vehicle_id, vehicle_code, vehicle_type,
               capacity_kg, fuel_efficiency_km_per_litre,
               current_location_id, status,
               maintenance_due_date
        FROM vehicles
        ORDER BY vehicle_id;
    """)

    result = []

    for row in cursor.fetchall():
        result.append({
            "vehicle_id": row[0],
            "vehicle_code": row[1],
            "vehicle_type": row[2],
            "capacity": float(row[3]),
            "efficiency": float(row[4]),
            "location_id": row[5],
            "status": row[6],
            "maintenance_due": row[7],
        })

    print(f"Generated {len(result)} vehicles.")
    return result


# ============================================================
# ROUTES
# ============================================================

def generate_routes(cursor, locations):
    header("5/12 GENERATING ROUTES")

    pairs = []

    for source in locations:
        for destination in locations:
            if source["location_id"] == destination["location_id"]:
                continue

            distance = haversine_km(
                source["latitude"],
                source["longitude"],
                destination["latitude"],
                destination["longitude"],
            )

            if distance >= 50:
                pairs.append((
                    source,
                    destination,
                    distance,
                ))

    random.shuffle(pairs)
    selected = pairs[:NUM_ROUTES]

    rows = []

    for index, (source, destination, straight_distance) in enumerate(
        selected,
        start=1,
    ):
        road_distance = (
            straight_distance
            * random.uniform(1.15, 1.45)
        )

        average_speed = random.uniform(38, 60)
        estimated_hours = road_distance / average_speed

        base_cost = (
            road_distance
            * random.uniform(22, 42)
        )

        rows.append((
            f"RT-{index:04d}",
            source["location_id"],
            destination["location_id"],
            round(road_distance, 2),
            round(estimated_hours, 2),
            round(base_cost, 2),
            "OPEN",
            round(random.uniform(5, 35), 2),
        ))

    query = """
        INSERT INTO routes
            (route_code, source_location_id,
             destination_location_id, distance_km,
             estimated_time_hours, base_cost,
             route_status, risk_score)
        VALUES %s;
    """

    execute_values(cursor, query, rows)

    cursor.execute("""
        SELECT route_id, route_code,
               source_location_id, destination_location_id,
               distance_km, estimated_time_hours,
               base_cost, route_status, risk_score
        FROM routes
        ORDER BY route_id;
    """)

    result = []

    for row in cursor.fetchall():
        result.append({
            "route_id": row[0],
            "route_code": row[1],
            "source_location_id": row[2],
            "destination_location_id": row[3],
            "distance": float(row[4]),
            "estimated_hours": float(row[5]),
            "base_cost": float(row[6]),
            "status": row[7],
            "risk_score": float(row[8]),
        })

    print(f"Generated {len(result)} routes.")
    return result


# ============================================================
# INVENTORY
# ============================================================

def generate_inventory(cursor, warehouses, products):
    header("6/12 GENERATING INVENTORY")

    rows = []

    for warehouse in warehouses:
        for product in products:
            quantity = random.randint(500, 12_000)
            safety_stock = max(
                100,
                int(quantity * random.uniform(0.08, 0.25)),
            )

            rows.append((
                warehouse["warehouse_id"],
                product["product_id"],
                quantity,
                safety_stock,
            ))

    query = """
        INSERT INTO inventory
            (warehouse_id, product_id,
             quantity_units, safety_stock_units)
        VALUES %s;
    """

    execute_values(cursor, query, rows)
    print(f"Generated {len(rows):,} inventory records.")


# ============================================================
# DEMAND HISTORY
# ============================================================

def generate_demand_history(cursor, locations, products):
    header("7/12 GENERATING DEMAND HISTORY")

    base_demand = {}

    for product in products:
        category = product["category"]

        ranges = {
            "Food": (700, 1800),
            "Electronics": (250, 900),
            "Pharma": (400, 1200),
            "Textiles": (350, 1000),
            "Automotive": (250, 750),
            "Agriculture": (300, 1000),
        }

        low, high = ranges.get(
            category,
            (200, 800),
        )

        base_demand[product["product_id"]] = random.randint(
            low,
            high,
        )

    rows = []

    for day_number in range(DEMAND_DAYS):
        current_date = START_DATE + timedelta(days=day_number)

        season = seasonal_factor(current_date)

        weekend_factor = (
            0.82
            if current_date.weekday() >= 5
            else 1.0
        )

        for location in locations:
            location_factor = random.uniform(0.75, 1.35)

            for product in products:
                noise = np.random.normal(1.0, 0.12)

                demand = (
                    base_demand[product["product_id"]]
                    * location_factor
                    * season
                    * weekend_factor
                    * noise
                )

                demand = max(20, int(round(demand)))

                rows.append((
                    location["location_id"],
                    product["product_id"],
                    current_date,
                    demand,
                ))

        progress(
            day_number + 1,
            DEMAND_DAYS,
            "Demand generation",
        )

    query = """
        INSERT INTO demand_history
            (location_id, product_id,
             demand_date, quantity_demanded)
        VALUES %s;
    """

    batch_insert(cursor, query, rows)

    print(f"Generated {len(rows):,} demand records.")


# ============================================================
# SHIPMENTS
# ============================================================

def generate_shipments(cursor, products, vehicles, routes):
    header("8/12 GENERATING SHIPMENTS")

    rows = []
    metadata = []

    for index in range(1, NUM_SHIPMENTS + 1):
        route = random.choice(routes)
        product = random.choice(products)
        vehicle = random.choice(vehicles)

        maximum_quantity = max(
            1,
            int(
                vehicle["capacity"]
                / max(product["weight"], 0.01)
            ),
        )

        maximum_quantity = min(
            maximum_quantity,
            2500,
        )

        minimum_quantity = min(
            20,
            maximum_quantity,
        )

        quantity = random.randint(
            minimum_quantity,
            maximum_quantity,
        )

        weight = quantity * product["weight"]

        departure_date = (
            START_DATE
            + timedelta(
                days=random.randint(
                    0,
                    DEMAND_DAYS - 1,
                )
            )
        )

        departure_time = datetime(
            departure_date.year,
            departure_date.month,
            departure_date.day,
            random.randint(5, 21),
            random.randint(0, 59),
        )

        expected_hours = route["estimated_hours"]

        expected_delivery = (
            departure_time
            + timedelta(hours=expected_hours)
        )

        # FIXED:
        # weather_condition now returns exactly:
        # (weather_name, weather_multiplier)
        weather, weather_factor = weather_condition(
            departure_date
        )

        # FIXED:
        # traffic_condition now returns exactly:
        # (traffic_level, traffic_multiplier)
        traffic, traffic_factor = traffic_condition()

        risk_score = (
            route["risk_score"] * 0.55
            + (weather_factor - 0.8) * 45
            + (traffic_factor - 0.8) * 35
            + random.uniform(-8, 8)
        )

        risk_score = max(
            0,
            min(100, risk_score),
        )

        delay_probability = min(
            0.95,
            0.04 + risk_score / 140,
        )

        if random.random() < delay_probability:
            delay_hours = max(
                0.5,
                float(
                    np.random.gamma(
                        shape=2.0,
                        scale=max(
                            0.5,
                            risk_score / 15,
                        ),
                    )
                ),
            )

            delay_hours = min(
                delay_hours,
                72,
            )

            actual_delivery = (
                expected_delivery
                + timedelta(hours=delay_hours)
            )

            status = "DELAYED"

        else:
            actual_delivery = (
                expected_delivery
                + timedelta(
                    hours=random.uniform(-0.5, 1.0)
                )
            )

            status = "DELIVERED"

        shipment_code = f"LS-{index:07d}"

        rows.append((
            shipment_code,
            product["product_id"],
            route["source_location_id"],
            route["destination_location_id"],
            vehicle["vehicle_id"],
            quantity,
            round(weight, 2),
            departure_time,
            expected_delivery,
            actual_delivery,
            status,
        ))

        metadata.append({
            "shipment_code": shipment_code,
            "product_id": product["product_id"],
            "source_location_id": route["source_location_id"],
            "destination_location_id": route["destination_location_id"],
            "vehicle_id": vehicle["vehicle_id"],
            "route_id": route["route_id"],
            "departure_time": departure_time,
            "expected_delivery": expected_delivery,
            "actual_delivery": actual_delivery,
            "status": status,
            "route_risk": route["risk_score"],
            "weather": weather,
            "weather_factor": weather_factor,
            "traffic": traffic,
            "traffic_factor": traffic_factor,
            "risk_score": risk_score,
        })

        progress(
            index,
            NUM_SHIPMENTS,
            "Shipment generation",
        )

    query = """
        INSERT INTO shipments
            (shipment_code, product_id,
             source_location_id, destination_location_id,
             vehicle_id, quantity_units, weight_kg,
             departure_time, expected_delivery_time,
             actual_delivery_time, status)
        VALUES %s;
    """

    batch_insert(cursor, query, rows)

    cursor.execute("""
        SELECT shipment_id, shipment_code
        FROM shipments
        ORDER BY shipment_id;
    """)

    id_lookup = {
        code: shipment_id
        for shipment_id, code in cursor.fetchall()
    }

    for item in metadata:
        item["shipment_id"] = id_lookup[
            item["shipment_code"]
        ]

    print(f"Generated {len(metadata):,} shipments.")
    return metadata


# ============================================================
# DISRUPTIONS
# ============================================================

def generate_disruptions(cursor, locations, routes):
    header("9/12 GENERATING DISRUPTIONS")

    names = [x[0] for x in DISRUPTION_TYPES]
    weights = [x[1] for x in DISRUPTION_TYPES]

    severity_options = [
        ("LOW", 0.30),
        ("MEDIUM", 0.42),
        ("HIGH", 0.22),
        ("CRITICAL", 0.06),
    ]

    descriptions = {
        "HEAVY_RAIN":
            "Heavy rainfall affecting transportation conditions.",
        "FLOOD":
            "Flooding reported near logistics infrastructure.",
        "TRAFFIC_CONGESTION":
            "Severe traffic congestion affecting route travel time.",
        "ROAD_CLOSURE":
            "Road closure affecting normal transportation.",
        "VEHICLE_BREAKDOWN":
            "Vehicle breakdown causing transportation delay.",
        "WAREHOUSE_FAILURE":
            "Warehouse operational issue affecting processing capacity.",
        "SUPPLIER_DELAY":
            "Supplier delay affecting expected shipment availability.",
        "LABOUR_SHORTAGE":
            "Temporary labour shortage affecting logistics operations.",
        "CYCLONE":
            "Cyclone conditions affecting transportation operations.",
    }

    rows = []
    metadata = []

    for index in range(1, NUM_DISRUPTIONS + 1):
        disruption_type = random.choices(
            names,
            weights=weights,
            k=1,
        )[0]

        route = random.choice(routes)
        location = random.choice(locations)

        severity = random.choices(
            [x[0] for x in severity_options],
            weights=[x[1] for x in severity_options],
            k=1,
        )[0]

        start_date = (
            START_DATE
            + timedelta(
                days=random.randint(
                    0,
                    DEMAND_DAYS - 1,
                )
            )
        )

        start_time = datetime(
            start_date.year,
            start_date.month,
            start_date.day,
            random.randint(0, 23),
            random.randint(0, 59),
        )

        duration_ranges = {
            "LOW": (1, 6),
            "MEDIUM": (3, 14),
            "HIGH": (8, 30),
            "CRITICAL": (18, 72),
        }

        low, high = duration_ranges[severity]

        end_time = (
            start_time
            + timedelta(
                hours=random.uniform(low, high)
            )
        )

        code = f"DIS-{index:06d}"

        status = (
            "RESOLVED"
            if end_time < datetime.now()
            else "ACTIVE"
        )

        rows.append((
            code,
            disruption_type,
            location["location_id"],
            route["route_id"],
            severity,
            descriptions[disruption_type],
            start_time,
            end_time,
            status,
        ))

        metadata.append({
            "code": code,
            "type": disruption_type,
            "location_id": location["location_id"],
            "route_id": route["route_id"],
            "severity": severity,
        })

        progress(
            index,
            NUM_DISRUPTIONS,
            "Disruption generation",
        )

    query = """
        INSERT INTO disruptions
            (disruption_code, disruption_type,
             location_id, route_id, severity,
             description, start_time, end_time, status)
        VALUES %s;
    """

    batch_insert(cursor, query, rows)

    cursor.execute("""
        SELECT disruption_id, disruption_code
        FROM disruptions
        ORDER BY disruption_id;
    """)

    id_lookup = {
        code: disruption_id
        for disruption_id, code in cursor.fetchall()
    }

    for item in metadata:
        item["disruption_id"] = id_lookup[
            item["code"]
        ]

    print(f"Generated {len(metadata):,} disruptions.")
    return metadata


# ============================================================
# RISK PREDICTIONS
# ============================================================

def generate_risk_predictions(cursor, shipments, disruptions):
    header("10/12 GENERATING INITIAL RISK PREDICTIONS")

    severity_bonus = {
        "LOW": 5,
        "MEDIUM": 12,
        "HIGH": 22,
        "CRITICAL": 35,
    }

    route_bonus = {}

    for disruption in disruptions:
        route_id = disruption["route_id"]

        route_bonus[route_id] = (
            route_bonus.get(route_id, 0)
            + severity_bonus[disruption["severity"]]
        )

    rows = []

    for index, shipment in enumerate(
        shipments,
        start=1,
    ):
        score = (
            shipment["risk_score"]
            + route_bonus.get(
                shipment["route_id"],
                0,
            )
        )

        score = max(
            0,
            min(100, score),
        )

        probability = (
            0.03
            + (score / 100) * 0.90
        )

        probability = max(
            0.01,
            min(0.98, probability),
        )

        if score < 30:
            predicted_delay = random.uniform(0, 1.5)
        elif score < 55:
            predicted_delay = random.uniform(1, 6)
        elif score < 75:
            predicted_delay = random.uniform(3, 15)
        else:
            predicted_delay = random.uniform(8, 36)

        level = risk_level(score)

        reasons = []

        if shipment["weather"] in (
            "HEAVY_RAIN",
            "STORM",
        ):
            reasons.append(
                f"Weather: {shipment['weather']}"
            )

        if shipment["traffic"] in (
            "HIGH",
            "SEVERE",
        ):
            reasons.append(
                f"Traffic: {shipment['traffic']}"
            )

        if shipment["route_risk"] >= 25:
            reasons.append(
                "High-risk logistics route"
            )

        if route_bonus.get(
            shipment["route_id"],
            0,
        ) > 0:
            reasons.append(
                "Disruption exposure"
            )

        if not reasons:
            reasons.append(
                "Normal logistics operating conditions"
            )

        rows.append((
            shipment["shipment_id"],
            round(probability, 4),
            round(score, 2),
            level,
            round(predicted_delay, 2),
            "; ".join(reasons),
            "LogiShield-Risk-v1",
        ))

        progress(
            index,
            len(shipments),
            "Risk prediction generation",
        )

    query = """
        INSERT INTO shipment_risk_predictions
            (shipment_id, delay_probability,
             risk_score, risk_level,
             predicted_delay_hours,
             prediction_reason, model_version)
        VALUES %s;
    """

    batch_insert(cursor, query, rows)

    print(f"Generated {len(rows):,} risk predictions.")


# ============================================================
# RECOVERY PLANS
# ============================================================

def generate_recovery_plans(cursor, disruptions):
    header("11/12 GENERATING RECOVERY PLANS")

    plan_types = [
        "REROUTE_SHIPMENTS",
        "USE_ALTERNATIVE_VEHICLE",
        "TEMPORARY_WAREHOUSE_TRANSFER",
        "PRIORITIZE_CRITICAL_SHIPMENTS",
    ]

    rows = []

    for disruption in disruptions:
        for option in range(1, 3):
            plan_type = random.choice(plan_types)

            multiplier = {
                "LOW": 1.0,
                "MEDIUM": 1.5,
                "HIGH": 2.5,
                "CRITICAL": 4.0,
            }[disruption["severity"]]

            cost = (
                random.uniform(5_000, 50_000)
                * multiplier
            )

            delay = (
                random.uniform(0.5, 16)
                * multiplier
            )

            savings = (
                cost
                * random.uniform(1.1, 2.5)
            )

            risk = random.uniform(10, 70)

            name = (
                plan_type.replace("_", " ").title()
                + f" Option {option}"
            )

            description = (
                f"{name} for disruption "
                f"{disruption['code']}."
            )

            rows.append((
                disruption["disruption_id"],
                name,
                description,
                round(cost, 2),
                round(delay, 2),
                round(savings, 2),
                round(risk, 2),
                option == 1,
            ))

    query = """
        INSERT INTO recovery_plans
            (disruption_id, plan_name, description,
             estimated_cost, estimated_delay_hours,
             estimated_savings, risk_score,
             is_recommended)
        VALUES %s;
    """

    batch_insert(cursor, query, rows)

    print(f"Generated {len(rows):,} recovery plans.")


# ============================================================
# ALERTS
# ============================================================

def generate_alerts(cursor, shipments, disruptions):
    header("12/12 GENERATING ALERTS")

    rows = []

    for shipment in shipments:
        if shipment["risk_score"] >= 70:
            severity = (
                "CRITICAL"
                if shipment["risk_score"] >= 85
                else "HIGH"
            )

            rows.append((
                "SHIPMENT_RISK",
                severity,
                "High-Risk Shipment Detected",
                (
                    f"Shipment {shipment['shipment_code']} "
                    "has elevated delay risk."
                ),
                shipment["shipment_id"],
                None,
                False,
            ))

    for disruption in disruptions:
        if disruption["severity"] in (
            "HIGH",
            "CRITICAL",
        ):
            rows.append((
                "DISRUPTION",
                disruption["severity"],
                (
                    disruption["type"]
                    .replace("_", " ")
                    .title()
                    + " Detected"
                ),
                (
                    f"Disruption {disruption['code']} "
                    "may affect logistics operations."
                ),
                None,
                disruption["disruption_id"],
                False,
            ))

    query = """
        INSERT INTO alerts
            (alert_type, severity, title, message,
             related_shipment_id,
             related_disruption_id,
             is_read)
        VALUES %s;
    """

    batch_insert(cursor, query, rows)

    print(f"Generated {len(rows):,} alerts.")


# ============================================================
# VALIDATION
# ============================================================

def validate_database(cursor):
    header("VALIDATING LOGISHIELD DATABASE")

    tables = [
        "locations",
        "warehouses",
        "products",
        "vehicles",
        "routes",
        "inventory",
        "demand_history",
        "shipments",
        "disruptions",
        "shipment_risk_predictions",
        "recovery_plans",
        "alerts",
    ]

    for table in tables:
        cursor.execute(
            f"SELECT COUNT(*) FROM {table};"
        )
        count = cursor.fetchone()[0]
        print(f"{table:<35} {count:>12,} rows")

    print()

    cursor.execute("""
        SELECT status, COUNT(*)
        FROM shipments
        GROUP BY status
        ORDER BY status;
    """)

    print("Shipment status distribution:")
    for status, count in cursor.fetchall():
        print(f"  {status:<20} {count:>10,}")

    print()

    cursor.execute("""
        SELECT risk_level, COUNT(*)
        FROM shipment_risk_predictions
        GROUP BY risk_level
        ORDER BY risk_level;
    """)

    print("Risk distribution:")
    for level, count in cursor.fetchall():
        print(f"  {level:<20} {count:>10,}")

    print()

    cursor.execute("""
        SELECT disruption_type, COUNT(*)
        FROM disruptions
        GROUP BY disruption_type
        ORDER BY COUNT(*) DESC;
    """)

    print("Disruption distribution:")
    for disruption_type, count in cursor.fetchall():
        print(f"  {disruption_type:<25} {count:>8,}")


# ============================================================
# MAIN
# ============================================================

def main():
    start = time.time()

    print()
    print("=" * 70)
    print("LOGISHIELD COMPLETE LOGISTICS DATA GENERATOR")
    print("=" * 70)

    print()
    print("Database:")
    print(f"  Host: {DB_HOST}")
    print(f"  Port: {DB_PORT}")
    print(f"  Name: {DB_NAME}")
    print(f"  User: {DB_USER}")

    print()
    print("Configuration:")
    print(f"  Locations:       {NUM_LOCATIONS:,}")
    print(f"  Warehouses:      {NUM_WAREHOUSES:,}")
    print(f"  Products:        {NUM_PRODUCTS:,}")
    print(f"  Vehicles:        {NUM_VEHICLES:,}")
    print(f"  Routes:          {NUM_ROUTES:,}")
    print(f"  Shipments:       {NUM_SHIPMENTS:,}")
    print(f"  Demand days:     {DEMAND_DAYS:,}")
    print(f"  Disruptions:     {NUM_DISRUPTIONS:,}")
    print()
    print(f"Random seed: {SEED}")

    connection = connect()

    try:
        cursor = connection.cursor()

        clear_database(cursor)

        locations = generate_locations(cursor)
        warehouses = generate_warehouses(cursor, locations)
        products = generate_products(cursor)
        vehicles = generate_vehicles(cursor, locations)
        routes = generate_routes(cursor, locations)

        generate_inventory(
            cursor,
            warehouses,
            products,
        )

        generate_demand_history(
            cursor,
            locations,
            products,
        )

        shipments = generate_shipments(
            cursor,
            products,
            vehicles,
            routes,
        )

        disruptions = generate_disruptions(
            cursor,
            locations,
            routes,
        )

        generate_risk_predictions(
            cursor,
            shipments,
            disruptions,
        )

        generate_recovery_plans(
            cursor,
            disruptions,
        )

        generate_alerts(
            cursor,
            shipments,
            disruptions,
        )

        validate_database(cursor)

        connection.commit()
        cursor.close()

        elapsed = time.time() - start

        header("LOGISHIELD DATA GENERATION COMPLETE")

        print(
            f"Total execution time: {elapsed / 60:.2f} minutes"
        )

        print()
        print("DATABASE STATUS: READY")
        print()
        print("Generated:")
        print("  30 Indian logistics locations")
        print("  10 warehouses")
        print("  20 products")
        print("  100 vehicles")
        print("  120 routes")
        print("  200 inventory records")
        print("  219,000 demand records")
        print("  100,000 shipments")
        print("  3,000 disruptions")
        print("  100,000 risk predictions")
        print("  6,000 recovery plans")
        print("  Operational alerts")
        print()

    except Exception as exc:
        connection.rollback()

        print()
        print("=" * 70)
        print("DATA GENERATION FAILED")
        print("=" * 70)
        print()
        print(exc)
        print()
        print("All changes from this run have been rolled back.")
        print("=" * 70)

        raise

    finally:
        connection.close()


if __name__ == "__main__":
    main()