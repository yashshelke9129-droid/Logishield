"""
LogiShield API
==============

Logistics Disruption Prediction & Recovery Intelligence System.

Backend:
    FastAPI
    PostgreSQL
    SQLAlchemy
    Scikit-learn
    Joblib

Start from C:\\LogiShield:

    backend\\.venv\\Scripts\\activate
    uvicorn backend.main:app --reload
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text

from backend.recovery_engine import analyze_shipment


# ============================================================
# PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]

BACKEND_DIR = PROJECT_ROOT / "backend"

MODEL_DIR = (
    PROJECT_ROOT
    / "models"
    / "delay_prediction"
)

MODEL_FILE = (
    MODEL_DIR
    / "shipment_delay_model_v2.joblib"
)

METADATA_FILE = (
    MODEL_DIR
    / "model_metadata_v2.json"
)

ENV_FILE = BACKEND_DIR / ".env"


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv(ENV_FILE)

DB_HOST = os.getenv(
    "DB_HOST",
    "localhost"
)

DB_PORT = os.getenv(
    "DB_PORT",
    "5432"
)

DB_NAME = os.getenv(
    "DB_NAME",
    "logishield"
)

DB_USER = os.getenv(
    "DB_USER",
    "postgres"
)

DB_PASSWORD = os.getenv(
    "DB_PASSWORD"
)


# ============================================================
# DATABASE
# ============================================================

if not DB_PASSWORD:
    raise RuntimeError(
        f"DB_PASSWORD not found in {ENV_FILE}"
    )


DATABASE_URL = (
    "postgresql+psycopg2://"
    f"{DB_USER}:"
    f"{DB_PASSWORD}@"
    f"{DB_HOST}:"
    f"{DB_PORT}/"
    f"{DB_NAME}"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10
)


# ============================================================
# MODEL
# ============================================================

# IMPORTANT:
# Render Free provides only 512 MB RAM. The original V2 RandomForest
# joblib file is too large to load safely in that environment and causes
# the process to be killed with exit status 137.
#
# Therefore this deployment uses a lightweight, deterministic runtime
# risk model. It keeps the same model.predict() / model.predict_proba()
# interface used by the rest of this file, so the API does not need to be
# rewritten. It uses the same operational features that were engineered
# for the V2 predictor: route risk, weather, traffic, disruptions,
# utilization, distance, time, cost and departure conditions.
#
# The full trained RandomForest remains suitable for local/high-memory
# deployments. This lightweight runtime is specifically for Render Free.

class LightweightDelayModel:
    """Low-memory delay-risk predictor for Render Free (512 MB)."""

    @staticmethod
    def _clip(value: float, low: float = 0.0, high: float = 1.0) -> float:
        return max(low, min(high, float(value)))

    @classmethod
    def _risk_probability(cls, row: pd.Series) -> float:
        def num(name: str, default: float = 0.0) -> float:
            try:
                value = row.get(name, default)
                if value is None or pd.isna(value):
                    return default
                return float(value)
            except Exception:
                return default

        route_risk = num("route_risk_score")
        # Support both 0-1 and 0-100 route-risk scales.
        if route_risk > 1.0:
            route_risk = route_risk / 100.0
        route_risk = cls._clip(route_risk)

        weather = cls._clip(num("weather_severity") / 5.0)
        traffic = cls._clip(num("traffic_severity") / 3.0)
        disruption = cls._clip(num("max_disruption_severity") / 5.0)
        disruption_count = cls._clip(num("active_disruptions") / 5.0)

        capacity = num("capacity_kg")
        weight = num("weight_kg")
        utilization = num("vehicle_utilization")
        if utilization <= 0 and capacity > 0:
            utilization = weight / capacity
        utilization = cls._clip(utilization)

        distance = num("distance_km")
        estimated_hours = num("estimated_time_hours")
        distance_factor = cls._clip(distance / 1500.0)
        time_factor = cls._clip(estimated_hours / 30.0)

        peak = cls._clip(num("is_peak_departure"))
        weekend = cls._clip(num("is_weekend"))
        bad_weather = cls._clip(num("has_bad_weather"))
        heavy_traffic = cls._clip(num("has_heavy_traffic"))
        severe_disruption = cls._clip(num("has_severe_disruption"))

        # Operational risk score. The weights deliberately emphasize
        # disruption/weather/traffic and route risk, while keeping shipment
        # and vehicle factors meaningful.
        score = (
            0.22 * route_risk
            + 0.17 * weather
            + 0.15 * traffic
            + 0.16 * disruption
            + 0.08 * disruption_count
            + 0.06 * utilization
            + 0.05 * distance_factor
            + 0.04 * time_factor
            + 0.03 * peak
            + 0.02 * weekend
            + 0.01 * bad_weather
            + 0.01 * heavy_traffic
        )

        if severe_disruption:
            score += 0.07

        # Calibrate the operational score into a useful probability range.
        probability = 0.05 + 0.90 * cls._clip(score)
        return round(cls._clip(probability, 0.01, 0.99), 6)

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        probabilities = [
            self._risk_probability(row)
            for _, row in X.iterrows()
        ]
        return np.asarray(
            [[1.0 - p, p] for p in probabilities],
            dtype=float
        )

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        probabilities = self.predict_proba(X)[:, 1]
        return (probabilities >= 0.50).astype(int)


model = LightweightDelayModel()
MODEL_RUNTIME = "lightweight_render_free"

# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="LogiShield API",
    description=(
        "AI-powered logistics disruption prediction "
        "and recovery intelligence system."
    ),
    version="2.0.1"
)


# ============================================================
# CORS
# ============================================================

cors_origins_raw = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"
)

cors_origins = [
    origin.strip().rstrip("/")
    for origin in cors_origins_raw.split(",")
    if origin.strip()
]

# Always allow local development.
cors_origins.extend([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
])

# Remove duplicates while preserving order.
cors_origins = list(dict.fromkeys(cors_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# SAFE VALUE HELPERS
# ============================================================

def safe_int(value, default=0):
    """
    Safely convert a value to integer.
    Handles None and NaN.
    """

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


def safe_float(value, default=0.0):
    """
    Safely convert a value to float.
    Handles None and NaN.
    """

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


def safe_string(value, default="UNKNOWN"):
    """
    Safely convert a value to string.
    """

    if value is None:
        return default

    try:

        if pd.isna(value):
            return default

    except Exception:
        pass

    return str(value)


def safe_datetime(value):
    """
    Convert datetime to ISO string.
    """

    if value is None:
        return None

    try:

        if pd.isna(value):
            return None

    except Exception:
        pass

    if hasattr(value, "isoformat"):
        return value.isoformat()

    return str(value)


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {
        "application": "LogiShield",
        "description": (
            "Logistics Disruption Prediction "
            "and Recovery Intelligence System"
        ),
        "version": "2.0.1",
        "status": "operational",
        "model": "Shipment Delay Predictor V2"
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health():

    database_status = "unknown"

    try:

        with engine.connect() as connection:

            connection.execute(
                text("SELECT 1")
            )

        database_status = "connected"

    except Exception:

        database_status = "disconnected"

    return {
        "status": "healthy",
        "database": database_status,
        "model_loaded": model is not None,
        "model_runtime": MODEL_RUNTIME
    }


# ============================================================
# GET SHIPMENT
# ============================================================

def get_shipment(
    shipment_id: int
) -> pd.DataFrame:

    query = """
        SELECT

            s.shipment_id,
            s.shipment_code,

            s.product_id,
            p.product_name,
            p.category AS product_category,
            p.unit_weight_kg,
            p.unit_price,

            s.source_location_id,
            src.city AS source_city,
            src.state AS source_state,
            src.latitude AS source_latitude,
            src.longitude AS source_longitude,

            s.destination_location_id,
            dst.city AS destination_city,
            dst.state AS destination_state,
            dst.latitude AS destination_latitude,
            dst.longitude AS destination_longitude,

            s.vehicle_id,
            v.vehicle_type,
            v.capacity_kg,
            v.fuel_efficiency_km_per_litre,

            r.route_id,
            r.route_code,
            r.distance_km,
            r.estimated_time_hours,
            r.base_cost,
            r.risk_score AS route_risk_score,
            r.route_status,

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

            s.status

        FROM shipments s

        INNER JOIN products p
            ON p.product_id = s.product_id

        INNER JOIN locations src
            ON src.location_id =
               s.source_location_id

        INNER JOIN locations dst
            ON dst.location_id =
               s.destination_location_id

        INNER JOIN vehicles v
            ON v.vehicle_id =
               s.vehicle_id

        INNER JOIN routes r
            ON r.source_location_id =
               s.source_location_id
            AND r.destination_location_id =
                s.destination_location_id

        WHERE s.shipment_id = :shipment_id

        LIMIT 1;
    """

    with engine.connect() as connection:

        return pd.read_sql(
            text(query),
            connection,
            params={
                "shipment_id": shipment_id
            }
        )


# ============================================================
# FEATURE ENGINEERING
# ============================================================

def create_prediction_features(
    df: pd.DataFrame
) -> pd.DataFrame:

    data = df.copy()

    data["departure_time"] = pd.to_datetime(
        data["departure_time"],
        errors="coerce"
    )

    # --------------------------------------------------------
    # TIME
    # --------------------------------------------------------

    data["departure_hour"] = (
        data["departure_time"].dt.hour
    )

    data["departure_day_of_week"] = (
        data["departure_time"].dt.dayofweek
    )

    data["departure_month"] = (
        data["departure_time"].dt.month
    )

    data["departure_week"] = (
        data["departure_time"]
        .dt.isocalendar()
        .week
        .astype("Int64")
    )

    data["is_weekend"] = (
        data["departure_day_of_week"] >= 5
    ).astype(int)

    data["is_peak_departure"] = (
        data["departure_hour"].between(7, 10)
        |
        data["departure_hour"].between(17, 21)
    ).astype(int)

    # --------------------------------------------------------
    # NUMERIC CONVERSION
    # --------------------------------------------------------

    numeric_columns = [
        "quantity_units",
        "weight_kg",
        "unit_weight_kg",
        "unit_price",
        "capacity_kg",
        "fuel_efficiency_km_per_litre",
        "distance_km",
        "estimated_time_hours",
        "base_cost",
        "route_risk_score",
        "weather_severity",
        "traffic_severity",
        "active_disruptions",
        "max_disruption_severity"
    ]

    for column in numeric_columns:

        data[column] = pd.to_numeric(
            data[column],
            errors="coerce"
        )

    # --------------------------------------------------------
    # FILL OPERATIONAL NULLS
    # --------------------------------------------------------

    data["weather_condition"] = (
        data["weather_condition"]
        .fillna("UNKNOWN")
    )

    data["traffic_level"] = (
        data["traffic_level"]
        .fillna("UNKNOWN")
    )

    data["active_disruptions"] = (
        data["active_disruptions"]
        .fillna(0)
    )

    data["max_disruption_severity"] = (
        data["max_disruption_severity"]
        .fillna(0)
    )

    data["weather_severity"] = (
        data["weather_severity"]
        .fillna(0)
    )

    data["traffic_severity"] = (
        data["traffic_severity"]
        .fillna(0)
    )

    # --------------------------------------------------------
    # VEHICLE
    # --------------------------------------------------------

    data["vehicle_utilization"] = (
        data["weight_kg"]
        /
        data["capacity_kg"].replace(
            0,
            np.nan
        )
    )

    data["vehicle_remaining_capacity"] = (
        data["capacity_kg"]
        -
        data["weight_kg"]
    )

    # --------------------------------------------------------
    # ROUTE
    # --------------------------------------------------------

    data["distance_per_hour"] = (
        data["distance_km"]
        /
        data["estimated_time_hours"].replace(
            0,
            np.nan
        )
    )

    data["cost_per_km"] = (
        data["base_cost"]
        /
        data["distance_km"].replace(
            0,
            np.nan
        )
    )

    # --------------------------------------------------------
    # SHIPMENT VALUE
    # --------------------------------------------------------

    data["shipment_value"] = (
        data["quantity_units"]
        *
        data["unit_price"]
    )

    # --------------------------------------------------------
    # GEOGRAPHIC DELTA
    # --------------------------------------------------------

    latitude_difference = (
        data["destination_latitude"]
        -
        data["source_latitude"]
    )

    longitude_difference = (
        data["destination_longitude"]
        -
        data["source_longitude"]
    )

    data["geographic_delta"] = np.sqrt(
        latitude_difference ** 2
        +
        longitude_difference ** 2
    )

    # --------------------------------------------------------
    # SEASON
    # --------------------------------------------------------

    data["is_monsoon"] = (
        data["departure_month"]
        .isin([6, 7, 8, 9])
    ).astype(int)

    data["is_festival_season"] = (
        data["departure_month"]
        .isin([10, 11])
    ).astype(int)

    # --------------------------------------------------------
    # DISRUPTION
    # --------------------------------------------------------

    data["has_active_disruption"] = (
        data["active_disruptions"] > 0
    ).astype(int)

    data["has_severe_disruption"] = (
        data["max_disruption_severity"] >= 4
    ).astype(int)

    # --------------------------------------------------------
    # WEATHER
    # --------------------------------------------------------

    data["has_bad_weather"] = (
        data["weather_severity"] >= 3
    ).astype(int)

    # --------------------------------------------------------
    # TRAFFIC
    # --------------------------------------------------------

    data["has_heavy_traffic"] = (
        data["traffic_severity"] >= 2
    ).astype(int)

    # --------------------------------------------------------
    # INTERACTIONS
    # --------------------------------------------------------

    data["weather_traffic_interaction"] = (
        data["weather_severity"]
        *
        data["traffic_severity"]
    )

    data["disruption_weather_interaction"] = (
        data["active_disruptions"]
        *
        data["weather_severity"]
    )

    data["disruption_traffic_interaction"] = (
        data["active_disruptions"]
        *
        data["traffic_severity"]
    )

    return data


# ============================================================
# MODEL INPUT
# ============================================================

def prepare_model_input(
    data: pd.DataFrame
) -> pd.DataFrame:

    numerical_features = [

        "quantity_units",
        "weight_kg",

        "unit_weight_kg",
        "unit_price",

        "capacity_kg",
        "fuel_efficiency_km_per_litre",

        "distance_km",
        "estimated_time_hours",
        "base_cost",

        "route_risk_score",

        "weather_severity",
        "traffic_severity",

        "active_disruptions",
        "max_disruption_severity",

        "departure_hour",
        "departure_day_of_week",
        "departure_month",
        "departure_week",

        "is_weekend",
        "is_peak_departure",

        "vehicle_utilization",
        "vehicle_remaining_capacity",

        "distance_per_hour",
        "cost_per_km",

        "shipment_value",
        "geographic_delta",

        "is_monsoon",
        "is_festival_season",

        "has_active_disruption",
        "has_severe_disruption",

        "has_bad_weather",
        "has_heavy_traffic",

        "weather_traffic_interaction",
        "disruption_weather_interaction",
        "disruption_traffic_interaction"
    ]

    categorical_features = [

        "product_category",

        "source_state",
        "destination_state",

        "vehicle_type",

        "route_status",

        "weather_condition",

        "traffic_level"
    ]

    features = (
        numerical_features
        +
        categorical_features
    )

    X = data[
        features
    ].copy()

    X = X.replace(
        [np.inf, -np.inf],
        np.nan
    )

    return X


# ============================================================
# RISK CLASSIFICATION
# ============================================================

def classify_risk(
    probability: float
) -> str:

    if probability >= 0.75:
        return "CRITICAL"

    if probability >= 0.50:
        return "HIGH"

    if probability >= 0.25:
        return "MEDIUM"

    return "LOW"


# ============================================================
# RECOMMENDATIONS
# ============================================================

def generate_recommendations(
    row: pd.Series,
    probability: float
) -> list[str]:

    recommendations = []

    weather_severity = safe_int(
        row["weather_severity"]
    )

    traffic_severity = safe_int(
        row["traffic_severity"]
    )

    active_disruptions = safe_int(
        row["active_disruptions"]
    )

    disruption_severity = safe_int(
        row["max_disruption_severity"]
    )

    utilization = safe_float(
        row["vehicle_utilization"]
    )

    route_risk = safe_float(
        row["route_risk_score"]
    )

    if weather_severity >= 3:

        recommendations.append(
            "Monitor severe weather and "
            "evaluate a weather-safe route."
        )

    if traffic_severity >= 4:

        recommendations.append(
            "Severe traffic detected. "
            "Evaluate alternate routing or timing."
        )

    elif traffic_severity >= 2:

        recommendations.append(
            "Heavy traffic detected. "
            "Check alternate routing."
        )

    if active_disruptions >= 1:

        recommendations.append(
            "Active disruption detected. "
            "Review recovery alternatives."
        )

    if disruption_severity >= 4:

        recommendations.append(
            "High-severity disruption detected. "
            "Escalate shipment for operational review."
        )

    if utilization > 0.90:

        recommendations.append(
            "Vehicle utilization exceeds 90%. "
            "Consider load redistribution."
        )

    if route_risk >= 70:

        recommendations.append(
            "Route risk is high. "
            "Evaluate an alternative route."
        )

    if probability >= 0.75:

        recommendations.append(
            "CRITICAL: Prioritize this shipment "
            "for immediate intervention."
        )

    elif probability >= 0.50:

        recommendations.append(
            "HIGH RISK: Closely monitor shipment "
            "and prepare a recovery option."
        )

    elif probability >= 0.25:

        recommendations.append(
            "MEDIUM RISK: Continue operational monitoring."
        )

    else:

        recommendations.append(
            "LOW RISK: Shipment currently appears stable."
        )

    return recommendations


# ============================================================
# SHIPMENT PREDICTION
# ============================================================

@app.get(
    "/api/v1/predictions/shipment/{shipment_id}"
)
def predict_shipment(
    shipment_id: int
):

    df = get_shipment(
        shipment_id
    )

    if df.empty:

        raise HTTPException(
            status_code=404,
            detail=(
                f"Shipment {shipment_id} "
                "was not found."
            )
        )

    featured = create_prediction_features(
        df
    )

    X = prepare_model_input(
        featured
    )

    try:

        probability = float(
            model.predict_proba(X)[0][1]
        )

        prediction = int(
            model.predict(X)[0]
        )

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "Model prediction failed: "
                f"{str(error)}"
            )
        )

    risk_level = classify_risk(
        probability
    )

    row = featured.iloc[0]

    recommendations = (
        generate_recommendations(
            row,
            probability
        )
    )

    return {

        "system": "LogiShield",

        "model": "Shipment Delay Predictor V2",

        "shipment": {

            "shipment_id":
                safe_int(
                    row["shipment_id"]
                ),

            "shipment_code":
                safe_string(
                    row["shipment_code"]
                ),

            "source":
                safe_string(
                    row["source_city"]
                ),

            "destination":
                safe_string(
                    row["destination_city"]
                ),

            "status":
                safe_string(
                    row["status"]
                )
        },

        "prediction": {

            "delay_probability":
                round(
                    probability,
                    4
                ),

            "delay_probability_percentage":
                round(
                    probability * 100,
                    2
                ),

            "predicted_delayed":
                bool(prediction),

            "risk_level":
                risk_level
        },

        "conditions": {

            "weather":
                safe_string(
                    row["weather_condition"]
                ),

            "weather_severity":
                safe_int(
                    row["weather_severity"]
                ),

            "traffic":
                safe_string(
                    row["traffic_level"]
                ),

            "traffic_severity":
                safe_int(
                    row["traffic_severity"]
                ),

            "active_disruptions":
                safe_int(
                    row["active_disruptions"]
                ),

            "maximum_disruption_severity":
                safe_int(
                    row[
                        "max_disruption_severity"
                    ]
                ),

            "route_risk":
                safe_float(
                    row["route_risk_score"]
                ),

            "vehicle_utilization":
                round(
                    safe_float(
                        row[
                            "vehicle_utilization"
                        ]
                    ),
                    4
                )
        },

        "recommendations":
            recommendations,

        "timestamp":
            datetime.utcnow().isoformat()
            + "Z"
    }


# ============================================================
# SHIPMENT LIST
# ============================================================

@app.get(
    "/api/v1/shipments"
)
def list_shipments(
    limit: int = 20
):

    limit = max(
        1,
        min(
            limit,
            100
        )
    )

    query = """
        SELECT

            s.shipment_id,
            s.shipment_code,

            s.status,

            s.source_location_id,
            s.destination_location_id,

            s.departure_time,

            s.weather_condition,
            s.traffic_level,

            s.active_disruptions,

            r.risk_score AS route_risk

        FROM shipments s

        LEFT JOIN routes r
            ON r.source_location_id =
               s.source_location_id
            AND r.destination_location_id =
                s.destination_location_id

        ORDER BY
            s.shipment_id

        LIMIT :limit;
    """

    try:

        with engine.connect() as connection:

            df = pd.read_sql(
                text(query),
                connection,
                params={
                    "limit": limit
                }
            )

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load shipments: "
                f"{str(error)}"
            )
        )

    records = []

    for _, row in df.iterrows():

        records.append({

            "shipment_id":
                safe_int(
                    row["shipment_id"]
                ),

            "shipment_code":
                safe_string(
                    row["shipment_code"]
                ),

            "status":
                safe_string(
                    row["status"]
                ),

            "source_location_id":
                safe_int(
                    row[
                        "source_location_id"
                    ]
                ),

            "destination_location_id":
                safe_int(
                    row[
                        "destination_location_id"
                    ]
                ),

            "departure_time":
                safe_datetime(
                    row["departure_time"]
                ),

            "weather":
                safe_string(
                    row["weather_condition"]
                ),

            "traffic":
                safe_string(
                    row["traffic_level"]
                ),

            "active_disruptions":
                safe_int(
                    row["active_disruptions"]
                ),

            "route_risk":
                safe_float(
                    row["route_risk"]
                )
        })

    return {

        "count":
            len(records),

        "shipments":
            records
    }


# ============================================================
# MODEL INFORMATION
# ============================================================

@app.get(
    "/api/v1/model"
)
def model_information():

    if not METADATA_FILE.exists():

        return {
            "model":
                "Shipment Delay Predictor V2",

            "status":
                "loaded",
            "runtime": MODEL_RUNTIME
        }

    try:

        with open(
            METADATA_FILE,
            "r",
            encoding="utf-8"
        ) as file:

            return json.load(file)

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to load model metadata: "
                f"{str(error)}"
            )
        )


# ============================================================
# RECOVERY DECISION ENGINE
# ============================================================

@app.get(
    "/api/v1/recovery/shipment/{shipment_id}"
)
def recovery_analysis(
    shipment_id: int
):
    """
    Run the complete LogiShield Recovery Decision Engine.

    Pipeline:

        Shipment
            â†“
        ML Delay Prediction
            â†“
        Recovery Decision Engine
            â†“
        Route Analysis
            â†“
        Vehicle Analysis
            â†“
        Recommended Recovery Plan
    """

    # --------------------------------------------------------
    # Load shipment
    # --------------------------------------------------------

    df = get_shipment(
        shipment_id
    )

    if df.empty:

        raise HTTPException(
            status_code=404,
            detail=(
                f"Shipment {shipment_id} "
                "was not found."
            )
        )

    # --------------------------------------------------------
    # Create ML features
    # --------------------------------------------------------

    try:

        featured = create_prediction_features(
            df
        )

        X = prepare_model_input(
            featured
        )

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "Feature engineering failed: "
                f"{str(error)}"
            )
        )

    # --------------------------------------------------------
    # Run ML prediction
    # --------------------------------------------------------

    try:

        probability = float(
            model.predict_proba(X)[0][1]
        )

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "ML prediction failed: "
                f"{str(error)}"
            )
        )

    # --------------------------------------------------------
    # Run recovery engine
    # --------------------------------------------------------

    try:

        result = analyze_shipment(
            engine=engine,
            shipment_id=shipment_id,
            delay_probability=probability
        )

        return result

    except ValueError as error:

        raise HTTPException(
            status_code=404,
            detail=str(error)
        )

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "Recovery Decision Engine failed: "
                f"{str(error)}"
            )
        )




# ============================================================
# ROUTE INTELLIGENCE API
# ============================================================

@app.get("/api/v1/routes")
def list_routes(
    limit: int = 120
):
    """
    Return live route intelligence data.

    Data source:
        PostgreSQL -> routes table

    Fields:
        route_id
        route_code
        source_location_id
        destination_location_id
        distance_km
        estimated_time_hours
        base_cost
        route_status
        risk_score
    """

    limit = max(
        1,
        min(
            limit,
            500
        )
    )

    query = """
        SELECT
            r.route_id,
            r.route_code,

            r.source_location_id,
            src.city AS source_city,
            src.state AS source_state,

            r.destination_location_id,
            dst.city AS destination_city,
            dst.state AS destination_state,

            r.distance_km,
            r.estimated_time_hours,
            r.base_cost,

            r.route_status,
            r.risk_score,

            r.created_at

        FROM routes r

        LEFT JOIN locations src
            ON src.location_id =
               r.source_location_id

        LEFT JOIN locations dst
            ON dst.location_id =
               r.destination_location_id

        ORDER BY
            r.risk_score DESC,
            r.route_id ASC

        LIMIT :limit;
    """

    try:

        with engine.connect() as connection:

            rows = connection.execute(
                text(query),
                {
                    "limit": limit
                }
            ).mappings().all()

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load route intelligence: "
                f"{str(error)}"
            )
        )

    routes = []

    for row in rows:

        routes.append({

            "route_id":
                safe_int(
                    row["route_id"]
                ),

            "route_code":
                safe_string(
                    row["route_code"]
                ),

            "source_location_id":
                safe_int(
                    row["source_location_id"]
                ),

            "source_city":
                safe_string(
                    row["source_city"]
                ),

            "source_state":
                safe_string(
                    row["source_state"]
                ),

            "destination_location_id":
                safe_int(
                    row["destination_location_id"]
                ),

            "destination_city":
                safe_string(
                    row["destination_city"]
                ),

            "destination_state":
                safe_string(
                    row["destination_state"]
                ),

            "distance_km":
                safe_float(
                    row["distance_km"]
                ),

            "estimated_time_hours":
                safe_float(
                    row["estimated_time_hours"]
                ),

            "base_cost":
                safe_float(
                    row["base_cost"]
                ),

            "route_status":
                safe_string(
                    row["route_status"]
                ),

            "risk_score":
                safe_float(
                    row["risk_score"]
                ),

            "created_at":
                safe_datetime(
                    row["created_at"]
                )

        })

    return {

        "system":
            "LogiShield",

        "module":
            "Route Intelligence",

        "count":
            len(routes),

        "routes":
            routes,

        "timestamp":
            datetime.utcnow().isoformat()
            + "Z"

    }




# ============================================================
# FORECASTING INTELLIGENCE API
# ============================================================

@app.get("/api/v1/forecasting")
def forecasting_intelligence():
    """
    Return live forecasting and ML intelligence.

    Data sources:
        shipments
        shipment_risk_predictions

    Provides:
        - shipment volume by month
        - delivered/delayed distribution
        - monthly delay percentage
        - ML risk distribution
        - average delay probability
        - average predicted delay hours
        - prediction confidence/risk trend
    """

    try:

        with engine.connect() as connection:

            # ------------------------------------------------
            # OVERALL SHIPMENT FORECASTING STATISTICS
            # ------------------------------------------------

            overall = connection.execute(text("""
                SELECT
                    COUNT(*) AS total_shipments,

                    COUNT(*) FILTER (
                        WHERE status = 'DELIVERED'
                    ) AS delivered_shipments,

                    COUNT(*) FILTER (
                        WHERE status = 'DELAYED'
                    ) AS delayed_shipments,

                    COUNT(*) FILTER (
                        WHERE status = 'IN_TRANSIT'
                    ) AS in_transit_shipments,

                    COUNT(*) FILTER (
                        WHERE status = 'CANCELLED'
                    ) AS cancelled_shipments,

                    AVG(
                        EXTRACT(
                            EPOCH FROM (
                                actual_delivery_time
                                - expected_delivery_time
                            )
                        ) / 3600.0
                    ) FILTER (
                        WHERE
                            actual_delivery_time IS NOT NULL
                            AND expected_delivery_time IS NOT NULL
                            AND actual_delivery_time >
                                expected_delivery_time
                    ) AS average_actual_delay_hours

                FROM shipments;
            """)).mappings().first()

            # ------------------------------------------------
            # ML PREDICTION STATISTICS
            # ------------------------------------------------

            prediction = connection.execute(text("""
                SELECT

                    COUNT(*) AS prediction_count,

                    COUNT(*) FILTER (
                        WHERE delay_probability >= 0.75
                    ) AS critical_predictions,

                    COUNT(*) FILTER (
                        WHERE delay_probability >= 0.50
                        AND delay_probability < 0.75
                    ) AS high_predictions,

                    COUNT(*) FILTER (
                        WHERE delay_probability >= 0.25
                        AND delay_probability < 0.50
                    ) AS medium_predictions,

                    COUNT(*) FILTER (
                        WHERE delay_probability < 0.25
                    ) AS low_predictions,

                    AVG(delay_probability)
                        AS average_delay_probability,

                    AVG(predicted_delay_hours)
                        AS average_predicted_delay_hours,

                    MAX(predicted_delay_hours)
                        AS maximum_predicted_delay_hours,

                    AVG(risk_score)
                        AS average_risk_score,

                    MAX(risk_score)
                        AS maximum_risk_score

                FROM shipment_risk_predictions;
            """)).mappings().first()

            # ------------------------------------------------
            # MONTHLY SHIPMENT TREND
            # ------------------------------------------------

            monthly = connection.execute(text("""
                SELECT

                    DATE_TRUNC(
                        'month',
                        departure_time
                    ) AS month,

                    COUNT(*) AS shipment_count,

                    COUNT(*) FILTER (
                        WHERE status = 'DELIVERED'
                    ) AS delivered_count,

                    COUNT(*) FILTER (
                        WHERE status = 'DELAYED'
                    ) AS delayed_count,

                    COUNT(*) FILTER (
                        WHERE status = 'IN_TRANSIT'
                    ) AS in_transit_count,

                    COUNT(*) FILTER (
                        WHERE status = 'CANCELLED'
                    ) AS cancelled_count

                FROM shipments

                WHERE departure_time IS NOT NULL

                GROUP BY
                    DATE_TRUNC(
                        'month',
                        departure_time
                    )

                ORDER BY
                    DATE_TRUNC(
                        'month',
                        departure_time
                    );
            """)).mappings().all()

            # ------------------------------------------------
            # MONTHLY ML TREND
            # ------------------------------------------------

            monthly_ml = connection.execute(text("""
                SELECT

                    DATE_TRUNC(
                        'month',
                        s.departure_time
                    ) AS month,

                    COUNT(*) AS prediction_count,

                    AVG(
                        p.delay_probability
                    ) AS average_delay_probability,

                    AVG(
                        p.predicted_delay_hours
                    ) AS average_predicted_delay_hours,

                    AVG(
                        p.risk_score
                    ) AS average_risk_score,

                    COUNT(*) FILTER (
                        WHERE p.delay_probability >= 0.75
                    ) AS critical_count,

                    COUNT(*) FILTER (
                        WHERE p.delay_probability >= 0.50
                        AND p.delay_probability < 0.75
                    ) AS high_count,

                    COUNT(*) FILTER (
                        WHERE p.delay_probability >= 0.25
                        AND p.delay_probability < 0.50
                    ) AS medium_count,

                    COUNT(*) FILTER (
                        WHERE p.delay_probability < 0.25
                    ) AS low_count

                FROM shipments s

                INNER JOIN shipment_risk_predictions p
                    ON p.shipment_id =
                       s.shipment_id

                WHERE s.departure_time IS NOT NULL

                GROUP BY
                    DATE_TRUNC(
                        'month',
                        s.departure_time
                    )

                ORDER BY
                    DATE_TRUNC(
                        'month',
                        s.departure_time
                    );
            """)).mappings().all()

            # ------------------------------------------------
            # RISK LEVEL SUMMARY
            # ------------------------------------------------

            risk_levels = connection.execute(text("""
                SELECT

                    risk_level,

                    COUNT(*) AS count,

                    AVG(delay_probability)
                        AS average_probability,

                    AVG(predicted_delay_hours)
                        AS average_delay_hours,

                    AVG(risk_score)
                        AS average_risk_score

                FROM shipment_risk_predictions

                GROUP BY
                    risk_level

                ORDER BY
                    CASE risk_level
                        WHEN 'CRITICAL' THEN 1
                        WHEN 'HIGH' THEN 2
                        WHEN 'MEDIUM' THEN 3
                        WHEN 'LOW' THEN 4
                        ELSE 5
                    END;
            """)).mappings().all()

            # ------------------------------------------------
            # TOP DELAY RISK SHIPMENTS
            # ------------------------------------------------

            top_risk = connection.execute(text("""
                SELECT

                    p.shipment_id,

                    s.shipment_code,

                    p.delay_probability,

                    p.risk_score,

                    p.risk_level,

                    p.predicted_delay_hours,

                    p.prediction_reason,

                    s.status

                FROM shipment_risk_predictions p

                INNER JOIN shipments s
                    ON s.shipment_id =
                       p.shipment_id

                ORDER BY
                    p.delay_probability DESC,
                    p.risk_score DESC

                LIMIT 10;
            """)).mappings().all()

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "Forecasting intelligence query failed: "
                f"{str(error)}"
            )
        )

    # ========================================================
    # SAFE CONVERSION HELPERS
    # ========================================================

    def clean_value(value):

        if value is None:
            return None

        try:
            return float(value)
        except Exception:
            return value

    # ========================================================
    # MONTHLY SHIPMENT RESPONSE
    # ========================================================

    monthly_data = []

    for row in monthly:

        month_value = row["month"]

        monthly_data.append({

            "month":
                month_value.strftime("%Y-%m")
                if month_value
                else None,

            "shipment_count":
                safe_int(
                    row["shipment_count"]
                ),

            "delivered_count":
                safe_int(
                    row["delivered_count"]
                ),

            "delayed_count":
                safe_int(
                    row["delayed_count"]
                ),

            "in_transit_count":
                safe_int(
                    row["in_transit_count"]
                ),

            "cancelled_count":
                safe_int(
                    row["cancelled_count"]
                ),

            "delay_percentage":
                round(
                    (
                        safe_int(
                            row["delayed_count"]
                        )
                        /
                        safe_int(
                            row["shipment_count"]
                        )
                        * 100
                    )
                    if safe_int(
                        row["shipment_count"]
                    )
                    else 0,
                    2
                )

        })

    # ========================================================
    # MONTHLY ML RESPONSE
    # ========================================================

    monthly_ml_data = []

    for row in monthly_ml:

        month_value = row["month"]

        monthly_ml_data.append({

            "month":
                month_value.strftime("%Y-%m")
                if month_value
                else None,

            "prediction_count":
                safe_int(
                    row["prediction_count"]
                ),

            "average_delay_probability":
                round(
                    safe_float(
                        row[
                            "average_delay_probability"
                        ]
                    ),
                    4
                ),

            "average_delay_probability_percentage":
                round(
                    safe_float(
                        row[
                            "average_delay_probability"
                        ]
                    )
                    * 100,
                    2
                ),

            "average_predicted_delay_hours":
                round(
                    safe_float(
                        row[
                            "average_predicted_delay_hours"
                        ]
                    ),
                    2
                ),

            "average_risk_score":
                round(
                    safe_float(
                        row[
                            "average_risk_score"
                        ]
                    ),
                    2
                ),

            "critical_count":
                safe_int(
                    row["critical_count"]
                ),

            "high_count":
                safe_int(
                    row["high_count"]
                ),

            "medium_count":
                safe_int(
                    row["medium_count"]
                ),

            "low_count":
                safe_int(
                    row["low_count"]
                )

        })

    # ========================================================
    # RISK LEVEL RESPONSE
    # ========================================================

    risk_data = []

    for row in risk_levels:

        risk_data.append({

            "risk_level":
                safe_string(
                    row["risk_level"]
                ),

            "count":
                safe_int(
                    row["count"]
                ),

            "average_probability":
                round(
                    safe_float(
                        row[
                            "average_probability"
                        ]
                    ),
                    4
                ),

            "average_probability_percentage":
                round(
                    safe_float(
                        row[
                            "average_probability"
                        ]
                    )
                    * 100,
                    2
                ),

            "average_delay_hours":
                round(
                    safe_float(
                        row[
                            "average_delay_hours"
                        ]
                    ),
                    2
                ),

            "average_risk_score":
                round(
                    safe_float(
                        row[
                            "average_risk_score"
                        ]
                    ),
                    2
                )

        })

    # ========================================================
    # TOP RISK RESPONSE
    # ========================================================

    top_risk_data = []

    for row in top_risk:

        top_risk_data.append({

            "shipment_id":
                safe_int(
                    row["shipment_id"]
                ),

            "shipment_code":
                safe_string(
                    row["shipment_code"]
                ),

            "delay_probability":
                round(
                    safe_float(
                        row[
                            "delay_probability"
                        ]
                    ),
                    4
                ),

            "delay_probability_percentage":
                round(
                    safe_float(
                        row[
                            "delay_probability"
                        ]
                    )
                    * 100,
                    2
                ),

            "risk_score":
                round(
                    safe_float(
                        row["risk_score"]
                    ),
                    2
                ),

            "risk_level":
                safe_string(
                    row["risk_level"]
                ),

            "predicted_delay_hours":
                round(
                    safe_float(
                        row[
                            "predicted_delay_hours"
                        ]
                    ),
                    2
                ),

            "prediction_reason":
                safe_string(
                    row[
                        "prediction_reason"
                    ]
                ),

            "status":
                safe_string(
                    row["status"]
                )

        })

    # ========================================================
    # FINAL RESPONSE
    # ========================================================

    return {

        "system":
            "LogiShield",

        "module":
            "Forecasting Intelligence",

        "status":
            "operational",

        "overall": {

            "total_shipments":
                safe_int(
                    overall[
                        "total_shipments"
                    ]
                ),

            "delivered_shipments":
                safe_int(
                    overall[
                        "delivered_shipments"
                    ]
                ),

            "delayed_shipments":
                safe_int(
                    overall[
                        "delayed_shipments"
                    ]
                ),

            "in_transit_shipments":
                safe_int(
                    overall[
                        "in_transit_shipments"
                    ]
                ),

            "cancelled_shipments":
                safe_int(
                    overall[
                        "cancelled_shipments"
                    ]
                ),

            "average_actual_delay_hours":
                round(
                    safe_float(
                        overall[
                            "average_actual_delay_hours"
                        ]
                    ),
                    2
                )

        },

        "ml": {

            "prediction_count":
                safe_int(
                    prediction[
                        "prediction_count"
                    ]
                ),

            "critical_predictions":
                safe_int(
                    prediction[
                        "critical_predictions"
                    ]
                ),

            "high_predictions":
                safe_int(
                    prediction[
                        "high_predictions"
                    ]
                ),

            "medium_predictions":
                safe_int(
                    prediction[
                        "medium_predictions"
                    ]
                ),

            "low_predictions":
                safe_int(
                    prediction[
                        "low_predictions"
                    ]
                ),

            "average_delay_probability":
                round(
                    safe_float(
                        prediction[
                            "average_delay_probability"
                        ]
                    ),
                    4
                ),

            "average_delay_probability_percentage":
                round(
                    safe_float(
                        prediction[
                            "average_delay_probability"
                        ]
                    )
                    * 100,
                    2
                ),

            "average_predicted_delay_hours":
                round(
                    safe_float(
                        prediction[
                            "average_predicted_delay_hours"
                        ]
                    ),
                    2
                ),

            "maximum_predicted_delay_hours":
                round(
                    safe_float(
                        prediction[
                            "maximum_predicted_delay_hours"
                        ]
                    ),
                    2
                ),

            "average_risk_score":
                round(
                    safe_float(
                        prediction[
                            "average_risk_score"
                        ]
                    ),
                    2
                ),

            "maximum_risk_score":
                round(
                    safe_float(
                        prediction[
                            "maximum_risk_score"
                        ]
                    ),
                    2
                )

        },

        "monthly_shipments":
            monthly_data,

        "monthly_ml":
            monthly_ml_data,

        "risk_levels":
            risk_data,

        "top_risk_shipments":
            top_risk_data,

        "timestamp":
            datetime.utcnow().isoformat()
            + "Z"

    }


# ============================================================
# RECOVERY CENTER API
# ============================================================

@app.get("/api/v1/recovery/plans")
def recovery_plans(
    limit: int = 100
):
    """
    Return recovery plans from PostgreSQL using the actual
    LogiShield recovery_plans schema.

    Database relationship:

        recovery_plans.disruption_id
                    |
                    v
        disruptions.disruption_id

    Additional information is loaded from locations and routes.
    """

    # --------------------------------------------------------
    # LIMIT PROTECTION
    # --------------------------------------------------------

    limit = max(
        1,
        min(
            limit,
            500
        )
    )

    # --------------------------------------------------------
    # DATABASE QUERY
    # --------------------------------------------------------

    query = """
        SELECT
            rp.recovery_id,
            rp.disruption_id,
            rp.plan_name,
            rp.description AS recovery_description,
            rp.estimated_cost,
            rp.estimated_delay_hours,
            rp.estimated_savings,
            rp.risk_score AS recovery_risk_score,
            rp.is_recommended,
            rp.created_at AS recovery_created_at,

            d.disruption_code,
            d.disruption_type,
            d.location_id,
            d.route_id,
            d.severity,
            d.description AS disruption_description,
            d.start_time,
            d.end_time,
            d.status AS disruption_status,
            d.created_at AS disruption_created_at,

            l.city AS disruption_city,
            l.state AS disruption_state,
            r.route_code,
            r.distance_km,
            r.estimated_time_hours,
            r.base_cost AS route_base_cost,
            r.route_status,
            r.risk_score AS route_risk_score

        FROM recovery_plans rp

        LEFT JOIN disruptions d
            ON d.disruption_id = rp.disruption_id

        LEFT JOIN locations l
            ON l.location_id = d.location_id

        LEFT JOIN routes r
            ON r.route_id = d.route_id

        ORDER BY
            rp.is_recommended DESC,
            rp.risk_score DESC,
            rp.estimated_delay_hours DESC,
            rp.created_at DESC

        LIMIT :limit;
    """

    # --------------------------------------------------------
    # EXECUTE QUERY
    # --------------------------------------------------------

    try:

        with engine.connect() as connection:

            rows = connection.execute(
                text(query),
                {
                    "limit": limit
                }
            ).mappings().all()

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load recovery plans: "
                f"{str(error)}"
            )
        )

    # --------------------------------------------------------
    # FORMAT PLANS
    # --------------------------------------------------------

    plans = []

    for row in rows:

        risk_score = safe_float(
            row.get("recovery_risk_score")
        )

        severity = safe_string(
            row.get("severity"),
            "UNKNOWN"
        ).upper()

        # ----------------------------------------------------
        # RECOVERY PRIORITY
        # ----------------------------------------------------

        if (
            severity == "CRITICAL"
            or risk_score >= 75
        ):

            recovery_priority = "CRITICAL"

        elif (
            severity == "HIGH"
            or risk_score >= 50
        ):

            recovery_priority = "HIGH"

        elif (
            severity == "MEDIUM"
            or risk_score >= 25
        ):

            recovery_priority = "MEDIUM"

        else:

            recovery_priority = "LOW"

        estimated_cost = safe_float(
            row.get("estimated_cost")
        )

        estimated_savings = safe_float(
            row.get("estimated_savings")
        )

        if estimated_cost > 0:

            savings_ratio = round(
                estimated_savings /
                estimated_cost,
                2
            )

        else:

            savings_ratio = 0.0

        # ----------------------------------------------------
        # PLAN RECORD
        # ----------------------------------------------------

        record = {

            "recovery_id": safe_int(
                row.get("recovery_id")
            ),

            "disruption_id": safe_int(
                row.get("disruption_id")
            ),

            "plan_name": safe_string(
                row.get("plan_name")
            ),

            "recovery_description": (
                None
                if row.get("recovery_description") is None
                else str(row.get("recovery_description"))
            ),

            "estimated_cost": round(
                estimated_cost,
                2
            ),

            "estimated_delay_hours": round(
                safe_float(
                    row.get("estimated_delay_hours")
                ),
                2
            ),

            "estimated_savings": round(
                estimated_savings,
                2
            ),

            "recovery_risk_score": round(
                risk_score,
                2
            ),

            "is_recommended": bool(
                row.get("is_recommended")
            ),

            "recommendation_status": (
                "RECOMMENDED"
                if bool(row.get("is_recommended"))
                else "ALTERNATIVE"
            ),

            "recovery_priority":
                recovery_priority,

            "savings_ratio":
                savings_ratio,

            "recovery_created_at":
                safe_datetime(
                    row.get("recovery_created_at")
                ),

            # ------------------------------------------------
            # DISRUPTION
            # ------------------------------------------------

            "disruption_code": safe_string(
                row.get("disruption_code")
            ),

            "disruption_type": safe_string(
                row.get("disruption_type")
            ),

            "location_id": safe_int(
                row.get("location_id")
            ),

            "route_id": safe_int(
                row.get("route_id")
            ),

            "severity": severity,

            "disruption_description": (
                None
                if row.get("disruption_description") is None
                else str(row.get("disruption_description"))
            ),

            "start_time": safe_datetime(
                row.get("start_time")
            ),

            "end_time": safe_datetime(
                row.get("end_time")
            ),

            "disruption_status": safe_string(
                row.get("disruption_status")
            ),

            "disruption_created_at":
                safe_datetime(
                    row.get("disruption_created_at")
                ),

            # ------------------------------------------------
            # LOCATION
            # ------------------------------------------------

            "disruption_city": safe_string(
                row.get("disruption_city")
            ),

            "disruption_state": safe_string(
                row.get("disruption_state")
            ),

            # ------------------------------------------------
            # ROUTE
            # ------------------------------------------------

            "route_code": safe_string(
                row.get("route_code")
            ),

            "distance_km": round(
                safe_float(
                    row.get("distance_km")
                ),
                2
            ),

            "estimated_time_hours": round(
                safe_float(
                    row.get("estimated_time_hours")
                ),
                2
            ),

            "route_base_cost": round(
                safe_float(
                    row.get("route_base_cost")
                ),
                2
            ),

            "route_status": safe_string(
                row.get("route_status")
            ),

            "route_risk_score": round(
                safe_float(
                    row.get("route_risk_score")
                ),
                2
            )
        }

        plans.append(
            record
        )

    # --------------------------------------------------------
    # SUMMARY
    # --------------------------------------------------------

    critical = sum(
        1
        for plan in plans
        if plan["recovery_priority"] == "CRITICAL"
    )

    high = sum(
        1
        for plan in plans
        if plan["recovery_priority"] == "HIGH"
    )

    medium = sum(
        1
        for plan in plans
        if plan["recovery_priority"] == "MEDIUM"
    )

    low = sum(
        1
        for plan in plans
        if plan["recovery_priority"] == "LOW"
    )

    recommended = sum(
        1
        for plan in plans
        if plan["is_recommended"]
    )

    total_estimated_cost = sum(
        plan["estimated_cost"]
        for plan in plans
    )

    total_estimated_savings = sum(
        plan["estimated_savings"]
        for plan in plans
    )

    average_delay = (
        sum(
            plan["estimated_delay_hours"]
            for plan in plans
        )
        / len(plans)
        if plans
        else 0.0
    )

    average_risk = (
        sum(
            plan["recovery_risk_score"]
            for plan in plans
        )
        / len(plans)
        if plans
        else 0.0
    )

    # --------------------------------------------------------
    # FINAL RESPONSE
    # --------------------------------------------------------

    return {

        "system":
            "LogiShield",

        "module":
            "Recovery Center",

        "status":
            "operational",

        "summary": {

            "total_plans":
                len(plans),

            "critical":
                critical,

            "high":
                high,

            "medium":
                medium,

            "low":
                low,

            "recommended":
                recommended,

            "total_estimated_cost":
                round(
                    total_estimated_cost,
                    2
                ),

            "total_estimated_savings":
                round(
                    total_estimated_savings,
                    2
                ),

            "average_estimated_delay_hours":
                round(
                    average_delay,
                    2
                ),

            "average_risk_score":
                round(
                    average_risk,
                    2
                )
        },

        "plans":
            plans,

        "timestamp":
            datetime.utcnow().isoformat()
            + "Z"
    }


# ============================================================

# DASHBOARD OVERVIEW API
# ============================================================

@app.get("/api/v1/dashboard/overview")
def dashboard_overview():
    """Return live LogiShield Command Center statistics."""

    try:
        with engine.connect() as connection:

            shipment = connection.execute(text("""
                SELECT
                    COUNT(*) AS total_shipments,
                    COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered_shipments,
                    COUNT(*) FILTER (WHERE status = 'DELAYED') AS delayed_shipments,
                    COUNT(*) FILTER (WHERE status = 'IN_TRANSIT') AS in_transit_shipments,
                    COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled_shipments
                FROM shipments;
            """)).mappings().first()

            total_shipments = safe_int(shipment["total_shipments"])
            delivered_shipments = safe_int(shipment["delivered_shipments"])
            delayed_shipments = safe_int(shipment["delayed_shipments"])
            in_transit_shipments = safe_int(shipment["in_transit_shipments"])
            cancelled_shipments = safe_int(shipment["cancelled_shipments"])

            delay_percentage = (
                round(delayed_shipments / total_shipments * 100, 2)
                if total_shipments else 0.0
            )

            risk = connection.execute(text("""
                SELECT
                    COUNT(*) FILTER (WHERE delay_probability >= 0.75) AS critical,
                    COUNT(*) FILTER (
                        WHERE delay_probability >= 0.50
                        AND delay_probability < 0.75
                    ) AS high,
                    COUNT(*) FILTER (
                        WHERE delay_probability >= 0.25
                        AND delay_probability < 0.50
                    ) AS medium,
                    COUNT(*) FILTER (WHERE delay_probability < 0.25) AS low,
                    AVG(delay_probability) AS average_delay_probability
                FROM shipment_risk_predictions;
            """)).mappings().first()

            critical_risk = safe_int(risk["critical"])
            high_risk = safe_int(risk["high"])
            medium_risk = safe_int(risk["medium"])
            low_risk = safe_int(risk["low"])
            average_delay_probability = safe_float(
                risk["average_delay_probability"]
            )

            disruption = connection.execute(text("""
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical,
                    COUNT(*) FILTER (WHERE severity = 'HIGH') AS high,
                    COUNT(*) FILTER (WHERE severity = 'MEDIUM') AS medium,
                    COUNT(*) FILTER (WHERE severity = 'LOW') AS low
                FROM disruptions;
            """)).mappings().first()

            total_disruptions = safe_int(disruption["total"])
            critical_disruptions = safe_int(disruption["critical"])
            high_disruptions = safe_int(disruption["high"])
            medium_disruptions = safe_int(disruption["medium"])
            low_disruptions = safe_int(disruption["low"])

            disruption_types = []

            for row in connection.execute(text("""
                SELECT
                    disruption_type,
                    COUNT(*) AS occurrences
                FROM disruptions
                GROUP BY disruption_type
                ORDER BY occurrences DESC
                LIMIT 10;
            """)).mappings():
                disruption_types.append({
                    "disruption_type": safe_string(row["disruption_type"]),
                    "occurrences": safe_int(row["occurrences"])
                })

            route = connection.execute(text("""
                SELECT
                    COUNT(*) AS total_routes,
                    COUNT(*) FILTER (WHERE route_status = 'OPEN') AS open_routes,
                    COUNT(*) FILTER (WHERE route_status <> 'OPEN') AS unavailable_routes,
                    AVG(risk_score) AS average_route_risk,
                    AVG(distance_km) AS average_distance_km
                FROM routes;
            """)).mappings().first()

            total_routes = safe_int(route["total_routes"])
            open_routes = safe_int(route["open_routes"])
            unavailable_routes = safe_int(route["unavailable_routes"])
            average_route_risk = safe_float(route["average_route_risk"])
            average_distance_km = safe_float(route["average_distance_km"])

            vehicle = connection.execute(text("""
                SELECT
                    COUNT(*) AS total_vehicles,
                    COUNT(*) FILTER (WHERE status = 'AVAILABLE') AS available_vehicles,
                    COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active_vehicles,
                    COUNT(*) FILTER (
                        WHERE status NOT IN ('AVAILABLE', 'ACTIVE')
                    ) AS unavailable_vehicles,
                    AVG(capacity_kg) AS average_capacity_kg
                FROM vehicles;
            """)).mappings().first()

            total_vehicles = safe_int(vehicle["total_vehicles"])
            available_vehicles = safe_int(vehicle["available_vehicles"])
            active_vehicles = safe_int(vehicle["active_vehicles"])
            unavailable_vehicles = safe_int(vehicle["unavailable_vehicles"])
            average_capacity_kg = safe_float(vehicle["average_capacity_kg"])

            warehouse = connection.execute(text("""
                SELECT COUNT(*) AS total_warehouses
                FROM warehouses;
            """)).mappings().first()

            total_warehouses = safe_int(warehouse["total_warehouses"])

            inventory = connection.execute(text("""
                SELECT
                    COUNT(*) AS inventory_records,
                    COALESCE(SUM(quantity_units), 0) AS total_inventory_units
                FROM inventory;
            """)).mappings().first()

            inventory_records = safe_int(inventory["inventory_records"])
            total_inventory_units = safe_float(
                inventory["total_inventory_units"]
            )

            recovery = connection.execute(text("""
                SELECT COUNT(*) AS total_recovery_plans
                FROM recovery_plans;
            """)).mappings().first()

            total_recovery_plans = safe_int(
                recovery["total_recovery_plans"]
            )

            high_risk_shipments = []

            for row in connection.execute(text("""
                SELECT
                    s.shipment_id,
                    s.shipment_code,
                    s.source_location_id,
                    src.city AS source_city,
                    s.destination_location_id,
                    dst.city AS destination_city,
                    s.status,
                    p.delay_probability
                FROM shipments s
                INNER JOIN shipment_risk_predictions p
                    ON p.shipment_id = s.shipment_id
                INNER JOIN locations src
                    ON src.location_id = s.source_location_id
                INNER JOIN locations dst
                    ON dst.location_id = s.destination_location_id
                ORDER BY p.delay_probability DESC
                LIMIT 10;
            """)).mappings():

                probability = safe_float(row["delay_probability"])

                high_risk_shipments.append({
                    "shipment_id": safe_int(row["shipment_id"]),
                    "shipment_code": safe_string(row["shipment_code"]),
                    "source_location_id": safe_int(row["source_location_id"]),
                    "source_city": safe_string(row["source_city"]),
                    "destination_location_id": safe_int(
                        row["destination_location_id"]
                    ),
                    "destination_city": safe_string(
                        row["destination_city"]
                    ),
                    "status": safe_string(row["status"]),
                    "delay_probability": round(probability, 4),
                    "delay_probability_percentage": round(
                        probability * 100, 2
                    ),
                    "risk_level": classify_risk(probability)
                })

        return {
            "system": "LogiShield",
            "dashboard": "National Logistics Command Center",
            "status": "operational",
            "timestamp": datetime.utcnow().isoformat() + "Z",

            "overview": {
                "total_shipments": total_shipments,
                "delivered_shipments": delivered_shipments,
                "delayed_shipments": delayed_shipments,
                "in_transit_shipments": in_transit_shipments,
                "cancelled_shipments": cancelled_shipments,
                "delay_percentage": delay_percentage
            },

            "risk": {
                "critical": critical_risk,
                "high": high_risk,
                "medium": medium_risk,
                "low": low_risk,
                "average_delay_probability": round(
                    average_delay_probability, 4
                ),
                "average_delay_probability_percentage": round(
                    average_delay_probability * 100, 2
                )
            },

            "disruptions": {
                "total": total_disruptions,
                "critical": critical_disruptions,
                "high": high_disruptions,
                "medium": medium_disruptions,
                "low": low_disruptions,
                "top_types": disruption_types
            },

            "routes": {
                "total": total_routes,
                "open": open_routes,
                "unavailable": unavailable_routes,
                "average_risk": round(average_route_risk, 2),
                "average_distance_km": round(average_distance_km, 2)
            },

            "vehicles": {
                "total": total_vehicles,
                "available": available_vehicles,
                "active": active_vehicles,
                "unavailable": unavailable_vehicles,
                "average_capacity_kg": round(average_capacity_kg, 2)
            },

            "infrastructure": {
                "warehouses": total_warehouses,
                "inventory_records": inventory_records,
                "total_inventory_units": round(
                    total_inventory_units, 2
                )
            },

            "recovery": {
                "total_recovery_plans": total_recovery_plans
            },

            "high_risk_shipments": high_risk_shipments
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Dashboard overview failed: {str(error)}"
        )
# ============================================================
# WHAT-IF SIMULATOR API
# ============================================================

@app.post("/api/v1/simulator/scenario")
def simulate_scenario(
    payload: dict[str, Any]
):
    """
    Run a live What-if logistics scenario against the current
    PostgreSQL-backed LogiShield network.

    The simulator uses:
        - current shipment volume
        - current ML delay predictions
        - current route risk
        - current route availability
        - current vehicle availability
        - user-selected disruption parameters

    This endpoint does not modify the database.
    """

    # --------------------------------------------------------
    # INPUT NORMALIZATION
    # --------------------------------------------------------

    disruption_type = safe_string(
        payload.get("disruption_type"),
        "TRAFFIC_CONGESTION"
    ).upper()

    severity = safe_string(
        payload.get("severity"),
        "HIGH"
    ).upper()

    probability = max(
        0.0,
        min(
            1.0,
            safe_float(
                payload.get("disruption_probability"),
                0.63
            )
        )
    )

    traffic_impact = max(
        0.0,
        min(
            1.0,
            safe_float(
                payload.get("traffic_impact"),
                0.55
            )
        )
    )

    weather_impact = max(
        0.0,
        min(
            1.0,
            safe_float(
                payload.get("weather_impact"),
                0.20
            )
        )
    )

    route_exposure = max(
        0.0,
        min(
            1.0,
            safe_float(
                payload.get("route_exposure"),
                0.35
            )
        )
    )

    severity_factor = {
        "LOW": 0.18,
        "MEDIUM": 0.38,
        "HIGH": 0.62,
        "CRITICAL": 0.86
    }.get(
        severity,
        0.62
    )

    # --------------------------------------------------------
    # LIVE DATABASE BASELINE
    # --------------------------------------------------------

    try:

        with engine.connect() as connection:

            shipment_stats = connection.execute(text("""
                SELECT
                    COUNT(*) AS total_shipments,

                    COUNT(*) FILTER (
                        WHERE status = 'DELIVERED'
                    ) AS delivered_shipments,

                    COUNT(*) FILTER (
                        WHERE status = 'DELAYED'
                    ) AS delayed_shipments,

                    COUNT(*) FILTER (
                        WHERE status = 'IN_TRANSIT'
                    ) AS in_transit_shipments,

                    COUNT(*) FILTER (
                        WHERE status = 'CANCELLED'
                    ) AS cancelled_shipments

                FROM shipments;
            """)).mappings().first()

            risk_stats = connection.execute(text("""
                SELECT
                    COALESCE(
                        AVG(delay_probability),
                        0
                    ) AS average_delay_probability,

                    COALESCE(
                        AVG(predicted_delay_hours),
                        0
                    ) AS average_predicted_delay_hours,

                    COUNT(*) FILTER (
                        WHERE delay_probability >= 0.75
                    ) AS critical_shipments,

                    COUNT(*) FILTER (
                        WHERE delay_probability >= 0.50
                    ) AS at_risk_shipments

                FROM shipment_risk_predictions;
            """)).mappings().first()

            route_stats = connection.execute(text("""
                SELECT
                    COUNT(*) AS total_routes,

                    COUNT(*) FILTER (
                        WHERE route_status = 'OPEN'
                    ) AS open_routes,

                    COALESCE(
                        AVG(risk_score),
                        0
                    ) AS average_route_risk,

                    COALESCE(
                        AVG(distance_km),
                        0
                    ) AS average_distance_km,

                    COALESCE(
                        AVG(estimated_time_hours),
                        0
                    ) AS average_route_time_hours,

                    COALESCE(
                        AVG(base_cost),
                        0
                    ) AS average_route_cost

                FROM routes;
            """)).mappings().first()

            vehicle_stats = connection.execute(text("""
                SELECT
                    COUNT(*) AS total_vehicles,

                    COUNT(*) FILTER (
                        WHERE status = 'AVAILABLE'
                    ) AS available_vehicles,

                    COALESCE(
                        AVG(capacity_kg),
                        0
                    ) AS average_capacity_kg

                FROM vehicles;
            """)).mappings().first()

            disruption_stats = connection.execute(text("""
                SELECT
                    COUNT(*) AS total_disruptions,

                    COUNT(*) FILTER (
                        WHERE severity = 'CRITICAL'
                    ) AS critical_disruptions

                FROM disruptions;
            """)).mappings().first()

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "What-if simulation database query failed: "
                f"{str(error)}"
            )
        )

    total_shipments = max(
        0,
        safe_int(
            shipment_stats["total_shipments"]
        )
    )

    delivered_shipments = safe_int(
        shipment_stats["delivered_shipments"]
    )

    delayed_shipments = safe_int(
        shipment_stats["delayed_shipments"]
    )

    in_transit_shipments = safe_int(
        shipment_stats["in_transit_shipments"]
    )

    cancelled_shipments = safe_int(
        shipment_stats["cancelled_shipments"]
    )

    baseline_probability = max(
        0.0,
        min(
            1.0,
            safe_float(
                risk_stats["average_delay_probability"]
            )
        )
    )

    baseline_delay_hours = max(
        0.0,
        safe_float(
            risk_stats["average_predicted_delay_hours"]
        )
    )

    baseline_critical = safe_int(
        risk_stats["critical_shipments"]
    )

    baseline_at_risk = safe_int(
        risk_stats["at_risk_shipments"]
    )

    total_routes = max(
        0,
        safe_int(
            route_stats["total_routes"]
        )
    )

    open_routes = max(
        0,
        safe_int(
            route_stats["open_routes"]
        )
    )

    average_route_risk = max(
        0.0,
        min(
            100.0,
            safe_float(
                route_stats["average_route_risk"]
            )
        )
    )

    average_distance_km = max(
        0.0,
        safe_float(
            route_stats["average_distance_km"]
        )
    )

    average_route_time_hours = max(
        0.0,
        safe_float(
            route_stats["average_route_time_hours"]
        )
    )

    average_route_cost = max(
        0.0,
        safe_float(
            route_stats["average_route_cost"]
        )
    )

    total_vehicles = max(
        0,
        safe_int(
            vehicle_stats["total_vehicles"]
        )
    )

    available_vehicles = max(
        0,
        safe_int(
            vehicle_stats["available_vehicles"]
        )
    )

    average_capacity_kg = max(
        0.0,
        safe_float(
            vehicle_stats["average_capacity_kg"]
        )
    )

    total_disruptions = max(
        0,
        safe_int(
            disruption_stats["total_disruptions"]
        )
    )

    critical_disruptions = max(
        0,
        safe_int(
            disruption_stats["critical_disruptions"]
        )
    )

    # --------------------------------------------------------
    # SCENARIO INTENSITY
    # --------------------------------------------------------

    probability_pressure = (
        0.35
        +
        0.65 * probability
    )

    disruption_pressure = (
        severity_factor
        *
        probability_pressure
    )

    combined_pressure = (
        disruption_pressure * 0.45
        +
        traffic_impact * 0.20
        +
        weather_impact * 0.15
        +
        route_exposure * 0.20
    )

    combined_pressure = max(
        0.0,
        min(
            1.0,
            combined_pressure
        )
    )

    # --------------------------------------------------------
    # PROJECTED DELAY
    # --------------------------------------------------------

    projected_delay_probability = (
        baseline_probability * 0.42
        +
        combined_pressure * 0.58
    )

    projected_delay_probability = max(
        0.0,
        min(
            0.99,
            projected_delay_probability
        )
    )

    # --------------------------------------------------------
    # AFFECTED SHIPMENTS
    # --------------------------------------------------------

    affected_ratio = (
        0.04
        +
        combined_pressure * 0.72
    )

    affected_ratio = max(
        0.0,
        min(
            0.98,
            affected_ratio
        )
    )

    affected_shipments = int(
        round(
            total_shipments
            *
            affected_ratio
        )
    )

    # --------------------------------------------------------
    # CRITICAL SHIPMENTS
    # --------------------------------------------------------

    critical_ratio = (
        baseline_critical
        /
        total_shipments
        if total_shipments
        else 0.0
    )

    critical_ratio += (
        combined_pressure
        *
        0.17
    )

    critical_ratio = max(
        0.0,
        min(
            0.90,
            critical_ratio
        )
    )

    projected_critical_shipments = int(
        round(
            total_shipments
            *
            critical_ratio
        )
    )

    projected_critical_shipments = max(
        projected_critical_shipments,
        min(
            affected_shipments,
            baseline_critical
        )
    )

    # --------------------------------------------------------
    # NETWORK RISK
    # --------------------------------------------------------

    network_risk = (
        average_route_risk * 0.35
        +
        projected_delay_probability * 100 * 0.45
        +
        combined_pressure * 100 * 0.20
    )

    network_risk = max(
        0.0,
        min(
            100.0,
            network_risk
        )
    )

    # --------------------------------------------------------
    # ROUTE AVAILABILITY
    # --------------------------------------------------------

    baseline_route_availability = (
        open_routes / total_routes * 100
        if total_routes
        else 0.0
    )

    route_loss = (
        route_exposure
        *
        combined_pressure
        *
        58.0
    )

    projected_route_availability = max(
        0.0,
        min(
            100.0,
            baseline_route_availability
            -
            route_loss
        )
    )

    # --------------------------------------------------------
    # DELAY DURATION
    # --------------------------------------------------------

    projected_delay_hours = (
        baseline_delay_hours * 0.55
        +
        max(
            1.0,
            average_route_time_hours
        )
        *
        combined_pressure
        *
        0.48
    )

    projected_delay_hours = max(
        0.1,
        projected_delay_hours
    )

    # --------------------------------------------------------
    # VEHICLES REQUIRED
    # --------------------------------------------------------

    affected_vehicle_load = (
        affected_shipments
        /
        max(
            1,
            total_shipments
        )
    )

    vehicle_demand = (
        affected_vehicle_load
        *
        max(
            1,
            total_vehicles
        )
        *
        (
            0.55
            +
            combined_pressure * 0.75
        )
    )

    vehicles_required = int(
        round(
            vehicle_demand
        )
    )

    vehicles_required = max(
        0,
        min(
            max(
                total_vehicles,
                0
            ),
            vehicles_required
        )
    )

    # --------------------------------------------------------
    # COST / RECOVERY ECONOMICS
    # --------------------------------------------------------

    cost_per_affected_shipment = (
        max(
            500.0,
            average_route_cost * 0.18
        )
        +
        projected_delay_hours * 650.0
    )

    estimated_cost_exposure = (
        affected_shipments
        *
        cost_per_affected_shipment
        *
        (
            0.65
            +
            combined_pressure
        )
    )

    recovery_investment = (
        estimated_cost_exposure
        *
        (
            0.18
            +
            combined_pressure * 0.15
        )
    )

    potential_savings = (
        estimated_cost_exposure
        *
        (
            0.27
            +
            (
                0.23
                *
                combined_pressure
            )
        )
    )

    # --------------------------------------------------------
    # BASELINE COMPARISON
    # --------------------------------------------------------

    baseline_network_risk = max(
        0.0,
        min(
            100.0,
            average_route_risk * 0.55
            +
            baseline_probability * 100 * 0.45
        )
    )

    delay_change_points = (
        projected_delay_probability
        -
        baseline_probability
    ) * 100

    # --------------------------------------------------------
    # RECOMMENDATION
    # --------------------------------------------------------

    if severity == "CRITICAL" or projected_delay_probability >= 0.75:
        recommendation = (
            "Prioritize critical shipments"
        )
        recommendation_reason = (
            "Critical intervention is recommended because "
            "the scenario pushes projected delay risk into "
            "the critical operating range."
        )

    elif route_exposure >= 0.65:
        recommendation = (
            "Activate alternate routing"
        )
        recommendation_reason = (
            "Route exposure is elevated. Activate alternate "
            "routes before network availability deteriorates."
        )

    elif traffic_impact >= 0.70:
        recommendation = (
            "Reroute traffic-sensitive shipments"
        )
        recommendation_reason = (
            "Traffic pressure is high enough to materially "
            "increase projected delay exposure."
        )

    elif weather_impact >= 0.65:
        recommendation = (
            "Activate weather-safe routing"
        )
        recommendation_reason = (
            "Weather impact is significant. Shift exposed "
            "shipments toward safer routes and timing windows."
        )

    else:
        recommendation = (
            "Monitor and prepare recovery capacity"
        )
        recommendation_reason = (
            "The simulated event increases network pressure, "
            "but does not yet require full emergency intervention."
        )

    return {
        "system": "LogiShield",
        "module": "What-if Simulator",
        "status": "operational",
        "simulation_engine": "live",
        "timestamp": (
            datetime.utcnow().isoformat()
            + "Z"
        ),

        "scenario": {
            "disruption_type": disruption_type,
            "severity": severity,
            "disruption_probability": round(
                probability,
                4
            ),
            "disruption_probability_percentage": round(
                probability * 100,
                2
            ),
            "traffic_impact": round(
                traffic_impact,
                4
            ),
            "traffic_impact_percentage": round(
                traffic_impact * 100,
                2
            ),
            "weather_impact": round(
                weather_impact,
                4
            ),
            "weather_impact_percentage": round(
                weather_impact * 100,
                2
            ),
            "route_exposure": round(
                route_exposure,
                4
            ),
            "route_exposure_percentage": round(
                route_exposure * 100,
                2
            ),
            "scenario_pressure": round(
                combined_pressure,
                4
            )
        },

        "baseline": {
            "total_shipments": total_shipments,
            "delivered_shipments": delivered_shipments,
            "delayed_shipments": delayed_shipments,
            "in_transit_shipments": in_transit_shipments,
            "cancelled_shipments": cancelled_shipments,
            "average_delay_probability": round(
                baseline_probability,
                4
            ),
            "average_delay_probability_percentage": round(
                baseline_probability * 100,
                2
            ),
            "critical_shipments": baseline_critical,
            "at_risk_shipments": baseline_at_risk,
            "network_risk": round(
                baseline_network_risk,
                2
            ),
            "route_availability": round(
                baseline_route_availability,
                2
            ),
            "available_vehicles": available_vehicles,
            "total_vehicles": total_vehicles
        },

        "impact": {
            "projected_delay_probability": round(
                projected_delay_probability,
                4
            ),
            "projected_delay_percentage": round(
                projected_delay_probability * 100,
                2
            ),
            "delay_change_points": round(
                delay_change_points,
                2
            ),
            "projected_critical_shipments": (
                projected_critical_shipments
            ),
            "critical_shipment_change": (
                projected_critical_shipments
                -
                baseline_critical
            ),
            "affected_shipments": affected_shipments,
            "affected_percentage": round(
                affected_ratio * 100,
                2
            ),
            "network_risk": round(
                network_risk,
                2
            ),
            "network_risk_change": round(
                network_risk
                -
                baseline_network_risk,
                2
            ),
            "estimated_delay_hours": round(
                projected_delay_hours,
                2
            ),
            "route_availability": round(
                projected_route_availability,
                2
            ),
            "vehicles_potentially_required": (
                vehicles_required
            )
        },

        "economics": {
            "estimated_cost_exposure": round(
                estimated_cost_exposure,
                2
            ),
            "recovery_investment": round(
                recovery_investment,
                2
            ),
            "potential_savings": round(
                potential_savings,
                2
            ),
            "average_route_cost": round(
                average_route_cost,
                2
            ),
            "average_distance_km": round(
                average_distance_km,
                2
            ),
            "average_capacity_kg": round(
                average_capacity_kg,
                2
            )
        },

        "network": {
            "total_routes": total_routes,
            "open_routes": open_routes,
            "available_vehicles": available_vehicles,
            "total_vehicles": total_vehicles,
            "total_disruptions": total_disruptions,
            "critical_disruptions": critical_disruptions
        },

        "recommendation": {
            "action": recommendation,
            "reason": recommendation_reason
        }
    }