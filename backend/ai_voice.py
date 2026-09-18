from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(tags=["AI Voice Assistant"])

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

SYSTEM_INSTRUCTIONS = """
You are LogiShield AI, the logistics voice assistant for a logistics intelligence platform.

You can:
- create a shipment in the LogiShield PostgreSQL database when the user clearly asks you to create/add one;
- find route options and route cost from the real LogiShield routes table;
- get a weather forecast for the origin and destination for a requested departure date;
- explain operational logistics information clearly and briefly.

Rules:
1. Never invent route, cost, weather, shipment, vehicle, product, or database facts. Use the available tools.
2. For a shipment creation request, do not create anything unless the user clearly requested creation/addition.
3. A shipment creation needs a shipment code/number, origin, destination, and a departure date/time. Ask a concise follow-up question when required information is missing.
4. When the user asks to add a shipment and also asks for cost, route, or weather, create/analyze it in the same operation when all required creation fields are available.
5. Use Indian currency notation (₹) when reporting costs.
6. Keep voice responses concise. Give the key result first, then the important route/weather details.
7. Clearly distinguish database route cost from any other business estimate. Do not claim an exact total cost if the database only provides a route base cost.
8. Weather data comes from an external forecast service and may be unavailable outside its forecast window. Say so rather than fabricating.
9. If multiple routes are returned, explain which route was selected by LogiShield's route ordering and list alternatives briefly.
10. When a shipment is created, explicitly state the generated database shipment ID and shipment code.
""".strip()


class VoiceCommand(BaseModel):
    command: str = Field(min_length=1, max_length=4000)
    history: list[dict] = Field(default_factory=list, max_length=20)


# ---------------------------------------------------------------------------
# DATABASE HELPERS
# ---------------------------------------------------------------------------


def _get_engine():
    """Import the existing LogiShield SQLAlchemy engine lazily.

    Lazy import avoids a circular import because main.py imports this router.
    """
    try:
        from backend.main import engine
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(f"Unable to access LogiShield database engine: {exc}") from exc
    return engine


def _safe_float(value, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def _safe_int(value, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except Exception:
        return default


def _resolve_location(connection, location: str):
    from sqlalchemy import text

    raw = str(location).strip()
    if not raw:
        return None

    if raw.isdigit():
        row = connection.execute(
            text(
                """
                SELECT location_id, city, state, country, latitude, longitude
                FROM locations
                WHERE location_id = :location_id
                LIMIT 1
                """
            ),
            {"location_id": int(raw)},
        ).mappings().first()
        if row:
            return dict(row)

    row = connection.execute(
        text(
            """
            SELECT location_id, city, state, country, latitude, longitude
            FROM locations
            WHERE LOWER(city) = LOWER(:city)
               OR LOWER(name) = LOWER(:city)
            ORDER BY location_id
            LIMIT 1
            """
        ),
        {"city": raw},
    ).mappings().first()

    if row:
        return dict(row)

    row = connection.execute(
        text(
            """
            SELECT location_id, city, state, country, latitude, longitude
            FROM locations
            WHERE city ILIKE :pattern
               OR name ILIKE :pattern
            ORDER BY location_id
            LIMIT 1
            """
        ),
        {"pattern": f"%{raw}%"},
    ).mappings().first()

    return dict(row) if row else None


def _get_routes(connection, source_id: int, destination_id: int):
    from sqlalchemy import text

    rows = connection.execute(
        text(
            """
            SELECT
                route_id,
                route_code,
                source_location_id,
                destination_location_id,
                distance_km,
                estimated_time_hours,
                base_cost,
                route_status,
                risk_score
            FROM routes
            WHERE source_location_id = :source_id
              AND destination_location_id = :destination_id
            ORDER BY
                CASE WHEN route_status = 'OPEN' THEN 0 ELSE 1 END,
                risk_score ASC,
                base_cost ASC,
                route_id ASC
            LIMIT 8
            """
        ),
        {"source_id": source_id, "destination_id": destination_id},
    ).mappings().all()

    return [dict(row) for row in rows]


def _weather_code_label(code: int) -> str:
    labels = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",
        56: "Freezing drizzle",
        57: "Dense freezing drizzle",
        61: "Slight rain",
        63: "Moderate rain",
        65: "Heavy rain",
        66: "Freezing rain",
        67: "Heavy freezing rain",
        71: "Slight snow",
        73: "Moderate snow",
        75: "Heavy snow",
        77: "Snow grains",
        80: "Slight rain showers",
        81: "Moderate rain showers",
        82: "Violent rain showers",
        85: "Slight snow showers",
        86: "Heavy snow showers",
        95: "Thunderstorm",
        96: "Thunderstorm with slight hail",
        99: "Thunderstorm with heavy hail",
    }
    return labels.get(code, "Unknown conditions")


def _fetch_weather(latitude: float, longitude: float, date_value: str):
    """Fetch a daily forecast from Open-Meteo without requiring a secret key."""
    params = urlencode(
        {
            "latitude": latitude,
            "longitude": longitude,
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            "timezone": "auto",
            "forecast_days": 16,
            "start_date": date_value,
            "end_date": date_value,
        }
    )
    request = Request(
        f"https://api.open-meteo.com/v1/forecast?{params}",
        headers={"User-Agent": "LogiShield/2.0"},
    )

    with urlopen(request, timeout=8) as response:
        payload = json.loads(response.read().decode("utf-8"))

    daily = payload.get("daily", {})
    dates = daily.get("time", [])
    if not dates:
        return {"available": False, "reason": "Forecast unavailable for this date."}

    index = dates.index(date_value) if date_value in dates else 0

    codes = daily.get("weather_code", [])
    highs = daily.get("temperature_2m_max", [])
    lows = daily.get("temperature_2m_min", [])
    rain_probs = daily.get("precipitation_probability_max", [])

    code = _safe_int(codes[index] if index < len(codes) else None, 0)
    high = _safe_float(highs[index] if index < len(highs) else None)
    low = _safe_float(lows[index] if index < len(lows) else None)
    rain_probability = _safe_int(rain_probs[index] if index < len(rain_probs) else None, 0)

    return {
        "available": True,
        "date": date_value,
        "condition": _weather_code_label(code),
        "weather_code": code,
        "temperature_max_c": round(high, 1),
        "temperature_min_c": round(low, 1),
        "precipitation_probability": rain_probability,
    }


def _normalize_departure(value: str | None) -> datetime:
    if not value:
        # The assistant should normally supply a date/time, but keep a stable
        # fallback so database inserts do not receive a naive null.
        return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1)

    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"

    try:
        dt = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise ValueError("Departure date/time must be ISO-compatible, for example 2026-09-19T10:00:00") from exc

    if dt.tzinfo:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _choose_product_and_vehicle(connection, quantity_units: int):
    from sqlalchemy import text

    product = connection.execute(
        text(
            """
            SELECT product_id, product_name, unit_weight_kg, unit_price
            FROM products
            ORDER BY product_id
            LIMIT 1
            """
        )
    ).mappings().first()

    if not product:
        raise ValueError("No product records are available in the LogiShield database.")

    required_weight = quantity_units * _safe_float(product["unit_weight_kg"], 1.0)

    vehicle = connection.execute(
        text(
            """
            SELECT vehicle_id, vehicle_type, capacity_kg, fuel_efficiency_km_per_litre
            FROM vehicles
            WHERE capacity_kg >= :required_weight
            ORDER BY capacity_kg ASC, vehicle_id ASC
            LIMIT 1
            """
        ),
        {"required_weight": required_weight},
    ).mappings().first()

    if not vehicle:
        vehicle = connection.execute(
            text(
                """
                SELECT vehicle_id, vehicle_type, capacity_kg, fuel_efficiency_km_per_litre
                FROM vehicles
                ORDER BY capacity_kg DESC, vehicle_id ASC
                LIMIT 1
                """
            )
        ).mappings().first()

    if not vehicle:
        raise ValueError("No vehicle records are available in the LogiShield database.")

    return dict(product), dict(vehicle), round(required_weight, 2)


# ---------------------------------------------------------------------------
# TOOL IMPLEMENTATIONS
# ---------------------------------------------------------------------------


def tool_get_route_intelligence(arguments: dict):
    from sqlalchemy import text

    origin = str(arguments.get("origin", "")).strip()
    destination = str(arguments.get("destination", "")).strip()
    requested_date = str(arguments.get("departure_date", "")).strip()
    preference = str(arguments.get("preference", "safest")).strip().lower() or "safest"

    if not origin or not destination:
        return {"ok": False, "error": "Origin and destination are required."}

    try:
        with _get_engine().connect() as connection:
            source = _resolve_location(connection, origin)
            target = _resolve_location(connection, destination)

            if not source:
                return {"ok": False, "error": f"Location '{origin}' was not found."}
            if not target:
                return {"ok": False, "error": f"Location '{destination}' was not found."}

            routes = _get_routes(
                connection,
                _safe_int(source["location_id"]),
                _safe_int(target["location_id"]),
            )

        if not routes:
            return {
                "ok": False,
                "error": "No route exists for the selected origin and destination.",
            }

        route_payload = []
        for route in routes:
            route_payload.append(
                {
                    "route_id": _safe_int(route["route_id"]),
                    "route_code": str(route["route_code"]),
                    "status": str(route["route_status"]),
                    "distance_km": round(_safe_float(route["distance_km"]), 2),
                    "estimated_time_hours": round(_safe_float(route["estimated_time_hours"]), 2),
                    "base_cost_inr": round(_safe_float(route["base_cost"]), 2),
                    "risk_score": round(_safe_float(route["risk_score"]), 2),
                }
            )

        preference_map = {
            "safest": lambda item: (0 if item["status"].upper() == "OPEN" else 1, item["risk_score"], item["base_cost_inr"]),
            "cheapest": lambda item: (0 if item["status"].upper() == "OPEN" else 1, item["base_cost_inr"], item["risk_score"]),
            "fastest": lambda item: (0 if item["status"].upper() == "OPEN" else 1, item["estimated_time_hours"], item["risk_score"]),
        }
        selector = preference_map.get(preference, preference_map["safest"])
        route_payload.sort(key=selector)

        weather = None
        if requested_date:
            try:
                source_weather = _fetch_weather(
                    _safe_float(source["latitude"]),
                    _safe_float(source["longitude"]),
                    requested_date,
                )
                target_weather = _fetch_weather(
                    _safe_float(target["latitude"]),
                    _safe_float(target["longitude"]),
                    requested_date,
                )
                weather = {
                    "origin": source_weather,
                    "destination": target_weather,
                }
            except Exception as exc:
                weather = {
                    "available": False,
                    "reason": f"Weather service unavailable: {exc}",
                }

        return {
            "ok": True,
            "origin": {
                "location_id": _safe_int(source["location_id"]),
                "city": str(source["city"]),
                "state": str(source["state"]),
            },
            "destination": {
                "location_id": _safe_int(target["location_id"]),
                "city": str(target["city"]),
                "state": str(target["state"]),
            },
            "preference": preference if preference in preference_map else "safest",
            "recommended_route": route_payload[0],
            "alternatives": route_payload[1:],
            "weather": weather,
            "cost_basis": "routes.base_cost",
        }

    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def tool_create_and_analyze_shipment(arguments: dict):
    from sqlalchemy import text

    shipment_code = str(arguments.get("shipment_code", "")).strip()
    origin = str(arguments.get("origin", "")).strip()
    destination = str(arguments.get("destination", "")).strip()
    departure_value = arguments.get("departure_time")
    quantity_units = max(1, _safe_int(arguments.get("quantity_units"), 100))
    status = str(arguments.get("status", "IN_TRANSIT")).upper().strip() or "IN_TRANSIT"
    route_preference = str(arguments.get("route_preference", "safest")).strip().lower() or "safest"

    if not shipment_code or not origin or not destination:
        return {
            "ok": False,
            "needs_clarification": True,
            "error": "Shipment code, origin and destination are required to create a shipment.",
        }

    try:
        departure_time = _normalize_departure(departure_value)

        with _get_engine().begin() as connection:
            existing = connection.execute(
                text(
                    "SELECT shipment_id FROM shipments WHERE shipment_code = :shipment_code LIMIT 1"
                ),
                {"shipment_code": shipment_code},
            ).mappings().first()

            if existing:
                return {
                    "ok": False,
                    "error": f"Shipment code '{shipment_code}' already exists.",
                    "shipment_id": _safe_int(existing["shipment_id"]),
                }

            source = _resolve_location(connection, origin)
            target = _resolve_location(connection, destination)

            if not source:
                return {"ok": False, "error": f"Location '{origin}' was not found."}
            if not target:
                return {"ok": False, "error": f"Location '{destination}' was not found."}

            routes = _get_routes(
                connection,
                _safe_int(source["location_id"]),
                _safe_int(target["location_id"]),
            )

            if not routes:
                return {
                    "ok": False,
                    "error": "No route exists for the selected origin and destination.",
                }

            if route_preference == "cheapest":
                selected_route = sorted(routes, key=lambda r: (0 if str(r["route_status"]).upper() == "OPEN" else 1, _safe_float(r["base_cost"]), _safe_float(r["risk_score"])))[0]
            elif route_preference == "fastest":
                selected_route = sorted(routes, key=lambda r: (0 if str(r["route_status"]).upper() == "OPEN" else 1, _safe_float(r["estimated_time_hours"]), _safe_float(r["risk_score"])))[0]
            else:
                selected_route = sorted(routes, key=lambda r: (0 if str(r["route_status"]).upper() == "OPEN" else 1, _safe_float(r["risk_score"]), _safe_float(r["base_cost"])))[0]
            product_hint = str(arguments.get("product", "")).strip()

            if product_hint:
                product = connection.execute(
                    text(
                        """
                        SELECT product_id, product_name, unit_weight_kg, unit_price
                        FROM products
                        WHERE product_name ILIKE :pattern
                        ORDER BY product_id
                        LIMIT 1
                        """
                    ),
                    {"pattern": f"%{product_hint}%"},
                ).mappings().first()
                if not product:
                    return {
                        "ok": False,
                        "error": f"Product '{product_hint}' was not found.",
                    }
                product = dict(product)

                required_weight = quantity_units * _safe_float(product["unit_weight_kg"], 1.0)
                vehicle = connection.execute(
                    text(
                        """
                        SELECT vehicle_id, vehicle_type, capacity_kg, fuel_efficiency_km_per_litre
                        FROM vehicles
                        WHERE capacity_kg >= :required_weight
                        ORDER BY capacity_kg ASC, vehicle_id ASC
                        LIMIT 1
                        """
                    ),
                    {"required_weight": required_weight},
                ).mappings().first()
                if not vehicle:
                    vehicle = connection.execute(
                        text(
                            """
                            SELECT vehicle_id, vehicle_type, capacity_kg, fuel_efficiency_km_per_litre
                            FROM vehicles
                            ORDER BY capacity_kg DESC, vehicle_id ASC
                            LIMIT 1
                            """
                        )
                    ).mappings().first()
                if not vehicle:
                    return {"ok": False, "error": "No vehicle records are available."}
                vehicle = dict(vehicle)
                weight = round(required_weight, 2)
            else:
                product, vehicle, weight = _choose_product_and_vehicle(
                    connection,
                    quantity_units,
                )

            estimated_hours = _safe_float(selected_route["estimated_time_hours"], 1.0)
            expected_delivery_time = departure_time + timedelta(hours=estimated_hours)

            result = connection.execute(
                text(
                    """
                    INSERT INTO shipments
                        (shipment_code, product_id,
                         source_location_id, destination_location_id,
                         vehicle_id, quantity_units, weight_kg,
                         departure_time, expected_delivery_time,
                         actual_delivery_time, status)
                    VALUES
                        (:shipment_code, :product_id,
                         :source_location_id, :destination_location_id,
                         :vehicle_id, :quantity_units, :weight_kg,
                         :departure_time, :expected_delivery_time,
                         NULL, :status)
                    RETURNING shipment_id
                    """
                ),
                {
                    "shipment_code": shipment_code,
                    "product_id": _safe_int(product["product_id"]),
                    "source_location_id": _safe_int(source["location_id"]),
                    "destination_location_id": _safe_int(target["location_id"]),
                    "vehicle_id": _safe_int(vehicle["vehicle_id"]),
                    "quantity_units": quantity_units,
                    "weight_kg": weight,
                    "departure_time": departure_time,
                    "expected_delivery_time": expected_delivery_time,
                    "status": status,
                },
            )

            shipment_id = _safe_int(result.scalar_one())

        weather = None
        departure_date = departure_time.date().isoformat()
        try:
            source_weather = _fetch_weather(
                _safe_float(source["latitude"]),
                _safe_float(source["longitude"]),
                departure_date,
            )
            target_weather = _fetch_weather(
                _safe_float(target["latitude"]),
                _safe_float(target["longitude"]),
                departure_date,
            )
            weather = {
                "origin": source_weather,
                "destination": target_weather,
            }
        except Exception as exc:
            weather = {
                "available": False,
                "reason": f"Weather service unavailable: {exc}",
            }

        return {
            "ok": True,
            "shipment": {
                "shipment_id": shipment_id,
                "shipment_code": shipment_code,
                "status": status,
                "origin": str(source["city"]),
                "destination": str(target["city"]),
                "departure_time": departure_time.isoformat(),
                "expected_delivery_time": expected_delivery_time.isoformat(),
                "quantity_units": quantity_units,
                "weight_kg": weight,
            },
            "product": {
                "product_id": _safe_int(product["product_id"]),
                "product_name": str(product["product_name"]),
                "unit_price_inr": round(_safe_float(product["unit_price"]), 2),
            },
            "vehicle": {
                "vehicle_id": _safe_int(vehicle["vehicle_id"]),
                "vehicle_type": str(vehicle["vehicle_type"]),
                "capacity_kg": round(_safe_float(vehicle["capacity_kg"]), 2),
            },
            "route_preference": route_preference if route_preference in {"safest", "cheapest", "fastest"} else "safest",
            "recommended_route": {
                "route_id": _safe_int(selected_route["route_id"]),
                "route_code": str(selected_route["route_code"]),
                "distance_km": round(_safe_float(selected_route["distance_km"]), 2),
                "estimated_time_hours": round(_safe_float(selected_route["estimated_time_hours"]), 2),
                "base_cost_inr": round(_safe_float(selected_route["base_cost"]), 2),
                "risk_score": round(_safe_float(selected_route["risk_score"]), 2),
                "status": str(selected_route["route_status"]),
            },
            "alternative_routes": [
                {
                    "route_code": str(route["route_code"]),
                    "base_cost_inr": round(_safe_float(route["base_cost"]), 2),
                    "risk_score": round(_safe_float(route["risk_score"]), 2),
                    "distance_km": round(_safe_float(route["distance_km"]), 2),
                }
                for route in routes[1:4]
            ],
            "weather": weather,
            "cost_basis": "routes.base_cost",
        }

    except Exception as exc:
        return {"ok": False, "error": str(exc)}



def tool_get_shipment_intelligence(arguments: dict):
    """Return real DB details for an existing shipment plus route/weather intelligence."""
    from sqlalchemy import text

    key = str(arguments.get("shipment_id_or_code", "")).strip()
    if not key:
        return {"ok": False, "error": "Shipment ID or shipment code is required."}

    try:
        with _get_engine().connect() as connection:
            params = {"shipment_code": key}
            where = "s.shipment_code = :shipment_code"
            if key.isdigit():
                where = "(s.shipment_code = :shipment_code OR s.shipment_id = :shipment_id)"
                params["shipment_id"] = int(key)

            row = connection.execute(
                text(
                    f"""
                    SELECT
                        s.shipment_id,
                        s.shipment_code,
                        s.status,
                        s.quantity_units,
                        s.weight_kg,
                        s.departure_time,
                        s.expected_delivery_time,
                        s.weather_condition,
                        s.traffic_level,
                        src.location_id AS source_location_id,
                        src.city AS source_city,
                        src.state AS source_state,
                        src.latitude AS source_latitude,
                        src.longitude AS source_longitude,
                        dst.location_id AS destination_location_id,
                        dst.city AS destination_city,
                        dst.state AS destination_state,
                        dst.latitude AS destination_latitude,
                        dst.longitude AS destination_longitude,
                        r.route_id,
                        r.route_code,
                        r.distance_km,
                        r.estimated_time_hours,
                        r.base_cost,
                        r.route_status,
                        r.risk_score,
                        p.product_name,
                        p.unit_price,
                        v.vehicle_type,
                        v.capacity_kg,
                        rp.delay_probability,
                        rp.predicted_delay_hours,
                        rp.risk_level
                    FROM shipments s
                    LEFT JOIN locations src
                        ON src.location_id = s.source_location_id
                    LEFT JOIN locations dst
                        ON dst.location_id = s.destination_location_id
                    LEFT JOIN routes r
                        ON r.source_location_id = s.source_location_id
                       AND r.destination_location_id = s.destination_location_id
                    LEFT JOIN products p
                        ON p.product_id = s.product_id
                    LEFT JOIN vehicles v
                        ON v.vehicle_id = s.vehicle_id
                    LEFT JOIN shipment_risk_predictions rp
                        ON rp.shipment_id = s.shipment_id
                    WHERE {where}
                    ORDER BY rp.prediction_id DESC NULLS LAST
                    LIMIT 1
                    """
                ),
                params,
            ).mappings().first()

            if not row:
                return {"ok": False, "error": f"Shipment '{key}' was not found."}

            departure_time = row["departure_time"]
            route = None
            if row["route_id"] is not None:
                route = {
                    "route_id": _safe_int(row["route_id"]),
                    "route_code": str(row["route_code"]),
                    "distance_km": round(_safe_float(row["distance_km"]), 2),
                    "estimated_time_hours": round(_safe_float(row["estimated_time_hours"]), 2),
                    "base_cost_inr": round(_safe_float(row["base_cost"]), 2),
                    "route_status": str(row["route_status"]),
                    "risk_score": round(_safe_float(row["risk_score"]), 2),
                }

            weather = None
            if departure_time is not None:
                date_value = departure_time.date().isoformat()
                try:
                    origin_weather = _fetch_weather(
                        _safe_float(row["source_latitude"]),
                        _safe_float(row["source_longitude"]),
                        date_value,
                    )
                    destination_weather = _fetch_weather(
                        _safe_float(row["destination_latitude"]),
                        _safe_float(row["destination_longitude"]),
                        date_value,
                    )
                    weather = {
                        "date": date_value,
                        "origin": origin_weather,
                        "destination": destination_weather,
                    }
                except Exception as exc:
                    weather = {
                        "available": False,
                        "reason": f"Weather service unavailable: {exc}",
                    }

            return {
                "ok": True,
                "shipment": {
                    "shipment_id": _safe_int(row["shipment_id"]),
                    "shipment_code": str(row["shipment_code"]),
                    "status": str(row["status"]),
                    "origin": str(row["source_city"]),
                    "destination": str(row["destination_city"]),
                    "quantity_units": _safe_int(row["quantity_units"]),
                    "weight_kg": round(_safe_float(row["weight_kg"]), 2),
                    "departure_time": departure_time.isoformat() if departure_time else None,
                    "expected_delivery_time": row["expected_delivery_time"].isoformat() if row["expected_delivery_time"] else None,
                },
                "product": {
                    "name": str(row["product_name"]) if row["product_name"] is not None else None,
                    "unit_price_inr": round(_safe_float(row["unit_price"]), 2) if row["unit_price"] is not None else None,
                },
                "vehicle": {
                    "type": str(row["vehicle_type"]) if row["vehicle_type"] is not None else None,
                    "capacity_kg": round(_safe_float(row["capacity_kg"]), 2) if row["capacity_kg"] is not None else None,
                },
                "route": route,
                "weather": weather,
                "ml_prediction": {
                    "delay_probability": round(_safe_float(row["delay_probability"]), 4) if row["delay_probability"] is not None else None,
                    "predicted_delay_hours": round(_safe_float(row["predicted_delay_hours"]), 2) if row["predicted_delay_hours"] is not None else None,
                    "risk_level": str(row["risk_level"]) if row["risk_level"] is not None else None,
                },
                "cost_basis": "routes.base_cost",
            }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# GEMINI TOOL DEFINITIONS
# ---------------------------------------------------------------------------

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

GEMINI_TOOLS = [
    {
        "function_declarations": [
            {
                "name": "get_route_intelligence",
                "description": (
                    "Use real LogiShield routes data to find route options, "
                    "route base costs, risk, distance, and optionally the "
                    "weather forecast for a requested date."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "origin": {
                            "type": "string",
                            "description": "Origin city or LogiShield location.",
                        },
                        "destination": {
                            "type": "string",
                            "description": "Destination city or LogiShield location.",
                        },
                        "departure_date": {
                            "type": "string",
                            "description": (
                                "Date in YYYY-MM-DD format when a forecast "
                                "is requested; use an empty string when weather "
                                "is not requested."
                            ),
                        },
                        "preference": {
                            "type": "string",
                            "enum": ["safest", "cheapest", "fastest"],
                            "description": "Route selection preference.",
                        },
                    },
                    "required": ["origin", "destination", "departure_date", "preference"],
                },
            },
            {
                "name": "create_and_analyze_shipment",
                "description": (
                    "Create a new shipment in the real LogiShield PostgreSQL "
                    "database and return its route, base cost, and departure-date "
                    "weather forecast. Only call this when the user clearly asks "
                    "to add or create a shipment."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "shipment_code": {
                            "type": "string",
                            "description": "Unique shipment code such as SHP-10521.",
                        },
                        "origin": {
                            "type": "string",
                            "description": "Origin city or LogiShield location.",
                        },
                        "destination": {
                            "type": "string",
                            "description": "Destination city or LogiShield location.",
                        },
                        "departure_time": {
                            "type": "string",
                            "description": "ISO-compatible date/time in India time unless the user specifies another timezone.",
                        },
                        "quantity_units": {
                            "type": "integer",
                            "description": "Optional quantity. Use 100 when the user does not specify one.",
                        },
                        "product": {
                            "type": "string",
                            "description": "Optional product name or keyword. Use an empty string when not specified.",
                        },
                        "status": {
                            "type": "string",
                            "enum": ["IN_TRANSIT", "DELIVERED", "DELAYED", "CANCELLED"],
                            "description": "Shipment status. Default to IN_TRANSIT.",
                        },
                        "route_preference": {
                            "type": "string",
                            "enum": ["safest", "cheapest", "fastest"],
                            "description": "Route preference. Default to safest.",
                        },
                    },
                    "required": [
                        "shipment_code",
                        "origin",
                        "destination",
                        "departure_time",
                        "quantity_units",
                        "product",
                        "status",
                        "route_preference",
                    ],
                },
            },
            {
                "name": "get_shipment_intelligence",
                "description": (
                    "Use the real LogiShield PostgreSQL database to inspect an "
                    "existing shipment by shipment ID or shipment code and return "
                    "its route, route base cost, ML delay risk, and weather."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "shipment_id_or_code": {
                            "type": "string",
                            "description": "Existing shipment ID or shipment code.",
                        },
                    },
                    "required": ["shipment_id_or_code"],
                },
            },
        ]
    }
]


def _run_tool(name: str, arguments: dict):
    if name == "get_route_intelligence":
        return tool_get_route_intelligence(arguments)
    if name == "create_and_analyze_shipment":
        return tool_create_and_analyze_shipment(arguments)
    if name == "get_shipment_intelligence":
        return tool_get_shipment_intelligence(arguments)
    return {"ok": False, "error": f"Unknown tool: {name}"}


def _serialize_history(history: list[dict]) -> list[dict]:
    safe_history: list[dict] = []
    for item in history[-12:]:
        role = str(item.get("role", "user"))
        content = str(item.get("content", ""))[:2000]
        if role not in {"user", "assistant"} or not content:
            continue
        safe_history.append({"role": role, "content": content})
    return safe_history


def _build_gemini_contents(payload: VoiceCommand):
    from google.genai import types

    contents = []

    for item in _serialize_history(payload.history):
        contents.append(
            types.Content(
                role=item["role"],
                parts=[types.Part.from_text(text=item["content"])],
            )
        )

    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=payload.command.strip())],
        )
    )

    return contents


@router.post("/api/v1/ai/command")
def ai_command(payload: VoiceCommand):
    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "The Google Gemini SDK is not installed. "
                "Run: python -m pip install google-genai"
            ),
        ) from exc

    api_key = os.getenv("GEMINI_API_KEY", "").strip()

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "GEMINI_API_KEY is not configured on the LogiShield backend."
            ),
        )

    try:
        client = genai.Client(api_key=api_key)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Unable to initialize Gemini client: {exc}",
        ) from exc

    india_now = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat()

    runtime_instructions = (
        SYSTEM_INSTRUCTIONS
        + "\nCurrent India date/time is "
        + india_now
        + ". Interpret relative phrases such as 'today', 'tomorrow', "
          "'day after tomorrow', and 'at 10 AM' in Asia/Kolkata unless "
          "the user explicitly specifies another timezone."
        + "\nYou are running with Gemini. Use LogiShield tools for real data."
    )

    config = types.GenerateContentConfig(
        system_instruction=runtime_instructions,
        tools=GEMINI_TOOLS,
        temperature=0.2,
    )

    contents = _build_gemini_contents(payload)
    tool_call_data: list[dict] = []

    try:
        max_rounds = 4
        response = None

        for _ in range(max_rounds):
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
                config=config,
            )

            if not response.candidates:
                break

            model_content = response.candidates[0].content
            if model_content is None:
                break

            function_calls = []
            for part in model_content.parts or []:
                function_call = getattr(part, "function_call", None)
                if function_call is not None:
                    function_calls.append(function_call)

            if not function_calls:
                break

            # Preserve Gemini's model response before returning tool results.
            contents.append(model_content)

            function_response_parts = []

            for function_call in function_calls:
                name = str(function_call.name or "")
                arguments = dict(function_call.args or {})

                result = _run_tool(name, arguments)

                call_id = getattr(function_call, "id", None)

                tool_call_data.append(
                    {
                        "name": name,
                        "arguments": arguments,
                        "result": result,
                    }
                )

                try:
                    function_response_parts.append(
                        types.Part.from_function_response(
                            name=name,
                            response={"result": result},
                            id=call_id,
                        )
                    )
                except TypeError:
                    # Compatibility fallback for SDK versions where id is
                    # not accepted by from_function_response().
                    function_response_parts.append(
                        types.Part.from_function_response(
                            name=name,
                            response={"result": result},
                        )
                    )

            contents.append(
                types.Content(
                    role="user",
                    parts=function_response_parts,
                )
            )

        if response is None:
            raise RuntimeError("Gemini returned no response.")

        output_text = (response.text or "").strip()

        if not output_text:
            output_text = (
                "I processed the request, but Gemini did not return a final response."
            )

        return {
            "ok": True,
            "assistant_message": output_text,
            "tool_calls": tool_call_data,
            "model": GEMINI_MODEL,
            "provider": "Google Gemini API",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        message = str(exc)

        # Make common Gemini API errors easier to understand in the UI.
        if "429" in message or "RESOURCE_EXHAUSTED" in message:
            message = (
                "Gemini API rate limit/quota was reached. "
                "Please wait and try again, or check the Gemini API quota. "
                f"Details: {message}"
            )
        elif "401" in message or "403" in message or "PERMISSION_DENIED" in message:
            message = (
                "Gemini API authentication/permission failed. "
                "Check GEMINI_API_KEY and the selected project. "
                f"Details: {message}"
            )

        raise HTTPException(
            status_code=502,
            detail=f"Gemini AI assistant request failed: {message}",
        ) from exc
