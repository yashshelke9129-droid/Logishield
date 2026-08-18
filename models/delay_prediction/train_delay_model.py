"""
LogiShield V2
Shipment Delay Prediction Model

Uses:
    PostgreSQL
    SQLAlchemy
    Scikit-learn
    Random Forest

Important:
    This version intentionally excludes:
        - actual_delivery_time
        - actual_delay_hours
        - status
        - delay_probability_simulated
        - operational_risk_score

These would cause target leakage.

The model learns from information available at shipment departure time.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


# ============================================================
# PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

BACKEND_DIR = PROJECT_ROOT / "backend"

MODEL_DIR = (
    PROJECT_ROOT
    / "models"
    / "delay_prediction"
)

MODEL_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# ENVIRONMENT
# ============================================================

ENV_FILE = BACKEND_DIR / ".env"

load_dotenv(
    ENV_FILE
)


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
# OUTPUT FILES
# ============================================================

MODEL_FILE = (
    MODEL_DIR
    / "shipment_delay_model_v2.joblib"
)

METADATA_FILE = (
    MODEL_DIR
    / "model_metadata_v2.json"
)

FEATURE_DATA_FILE = (
    MODEL_DIR
    / "training_features_v2.csv"
)


# ============================================================
# DATABASE ENGINE
# ============================================================

def create_database_engine():

    if not DB_PASSWORD:

        print()
        print("=" * 70)
        print("DATABASE PASSWORD NOT FOUND")
        print("=" * 70)
        print()
        print(
            f"Expected environment file:\n{ENV_FILE}"
        )
        print()
        print(
            "Make sure DB_PASSWORD exists in .env"
        )

        sys.exit(1)

    connection_url = (
        "postgresql+psycopg2://"
        f"{DB_USER}:"
        f"{DB_PASSWORD}@"
        f"{DB_HOST}:"
        f"{DB_PORT}/"
        f"{DB_NAME}"
    )

    try:

        engine = create_engine(
            connection_url,
            pool_pre_ping=True
        )

        with engine.connect() as connection:

            connection.execute(
                text("SELECT 1")
            )

        return engine

    except Exception as error:

        print()
        print("=" * 70)
        print("DATABASE CONNECTION FAILED")
        print("=" * 70)
        print()
        print(error)

        sys.exit(1)


# ============================================================
# LOAD DATA
# ============================================================

def load_data(engine):

    print()
    print("=" * 70)
    print("LOADING LOGISHIELD V2 DATA")
    print("=" * 70)

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
            s.actual_delivery_time,

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

        WHERE
            s.condition_version = 'V2'

        ORDER BY
            s.shipment_id;
    """

    print()
    print("Executing PostgreSQL query...")

    df = pd.read_sql(
        text(query),
        engine
    )

    print()
    print(
        f"Rows loaded: {len(df):,}"
    )

    print(
        f"Columns loaded: {len(df.columns)}"
    )

    return df


# ============================================================
# CLEAN DATA
# ============================================================

def clean_data(df):

    print()
    print("=" * 70)
    print("CLEANING DATA")
    print("=" * 70)

    df = df.copy()

    datetime_columns = [
        "departure_time",
        "expected_delivery_time",
        "actual_delivery_time"
    ]

    for column in datetime_columns:

        df[column] = pd.to_datetime(
            df[column],
            errors="coerce"
        )

    before = len(df)

    df = df.dropna(
        subset=[
            "departure_time",
            "expected_delivery_time",
            "actual_delivery_time"
        ]
    )

    removed = (
        before
        - len(df)
    )

    print(
        f"Rows removed: {removed:,}"
    )

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

        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

    print(
        f"Rows remaining: {len(df):,}"
    )

    return df


# ============================================================
# TARGET
# ============================================================

def create_target(df):

    print()
    print("=" * 70)
    print("CREATING REAL DELAY TARGET")
    print("=" * 70)

    df = df.copy()

    df["actual_delay_hours"] = (
        (
            df["actual_delivery_time"]
            -
            df["expected_delivery_time"]
        )
        .dt.total_seconds()
        / 3600
    )

    df["delay_target"] = (
        df["actual_delay_hours"] > 0
    ).astype(int)

    delayed = int(
        df["delay_target"].sum()
    )

    on_time = (
        len(df)
        -
        delayed
    )

    percentage = (
        delayed
        /
        len(df)
        *
        100
    )

    print()
    print(
        f"Total shipments: {len(df):,}"
    )

    print(
        f"Delayed shipments: {delayed:,}"
    )

    print(
        f"On-time shipments: {on_time:,}"
    )

    print(
        f"Delay percentage: {percentage:.2f}%"
    )

    return df


# ============================================================
# FEATURE ENGINEERING
# ============================================================

def create_features(df):

    print()
    print("=" * 70)
    print("FEATURE ENGINEERING")
    print("=" * 70)

    df = df.copy()

    # --------------------------------------------------------
    # TIME FEATURES
    # --------------------------------------------------------

    df["departure_hour"] = (
        df["departure_time"].dt.hour
    )

    df["departure_day_of_week"] = (
        df["departure_time"].dt.dayofweek
    )

    df["departure_month"] = (
        df["departure_time"].dt.month
    )

    df["departure_week"] = (
        df["departure_time"]
        .dt.isocalendar()
        .week
        .astype(int)
    )

    df["is_weekend"] = (
        df["departure_day_of_week"]
        >= 5
    ).astype(int)

    df["is_peak_departure"] = (
        (
            df["departure_hour"]
            .between(7, 10)
        )
        |
        (
            df["departure_hour"]
            .between(17, 21)
        )
    ).astype(int)

    # --------------------------------------------------------
    # VEHICLE UTILIZATION
    # --------------------------------------------------------

    df["vehicle_utilization"] = (
        df["weight_kg"]
        /
        df["capacity_kg"].replace(
            0,
            np.nan
        )
    )

    df["vehicle_remaining_capacity"] = (
        df["capacity_kg"]
        -
        df["weight_kg"]
    )

    # --------------------------------------------------------
    # ROUTE FEATURES
    # --------------------------------------------------------

    df["distance_per_hour"] = (
        df["distance_km"]
        /
        df["estimated_time_hours"].replace(
            0,
            np.nan
        )
    )

    df["cost_per_km"] = (
        df["base_cost"]
        /
        df["distance_km"].replace(
            0,
            np.nan
        )
    )

    # --------------------------------------------------------
    # SHIPMENT VALUE
    # --------------------------------------------------------

    df["shipment_value"] = (
        df["quantity_units"]
        *
        df["unit_price"]
    )

    # --------------------------------------------------------
    # GEOGRAPHIC DELTA
    # --------------------------------------------------------

    latitude_difference = (
        df["destination_latitude"]
        -
        df["source_latitude"]
    )

    longitude_difference = (
        df["destination_longitude"]
        -
        df["source_longitude"]
    )

    df["geographic_delta"] = np.sqrt(
        latitude_difference ** 2
        +
        longitude_difference ** 2
    )

    # --------------------------------------------------------
    # MONSOON
    # --------------------------------------------------------

    df["is_monsoon"] = (
        df["departure_month"]
        .isin([6, 7, 8, 9])
    ).astype(int)

    # --------------------------------------------------------
    # FESTIVAL SEASON
    # --------------------------------------------------------

    df["is_festival_season"] = (
        df["departure_month"]
        .isin([10, 11])
    ).astype(int)

    # --------------------------------------------------------
    # DISRUPTION EXPOSURE
    # --------------------------------------------------------

    df["has_active_disruption"] = (
        df["active_disruptions"]
        > 0
    ).astype(int)

    df["has_severe_disruption"] = (
        df["max_disruption_severity"]
        >= 4
    ).astype(int)

    # --------------------------------------------------------
    # WEATHER RISK
    # --------------------------------------------------------

    df["has_bad_weather"] = (
        df["weather_severity"]
        >= 3
    ).astype(int)

    # --------------------------------------------------------
    # TRAFFIC RISK
    # --------------------------------------------------------

    df["has_heavy_traffic"] = (
        df["traffic_severity"]
        >= 2
    ).astype(int)

    # --------------------------------------------------------
    # CONDITION INTERACTIONS
    # --------------------------------------------------------

    df["weather_traffic_interaction"] = (
        df["weather_severity"]
        *
        df["traffic_severity"]
    )

    df["disruption_weather_interaction"] = (
        df["active_disruptions"]
        *
        df["weather_severity"]
    )

    df["disruption_traffic_interaction"] = (
        df["active_disruptions"]
        *
        df["traffic_severity"]
    )

    print()
    print(
        "Operational features created."
    )

    return df


# ============================================================
# PREPARE ML DATA
# ============================================================

def prepare_ml_data(df):

    print()
    print("=" * 70)
    print("PREPARING MACHINE LEARNING DATA")
    print("=" * 70)

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

    selected_features = (
        numerical_features
        +
        categorical_features
    )

    X = df[
        selected_features
    ].copy()

    y = df[
        "delay_target"
    ].copy()

    X = X.replace(
        [np.inf, -np.inf],
        np.nan
    )

    print()
    print(
        f"Total features: {len(selected_features)}"
    )

    print(
        f"Numerical features: {len(numerical_features)}"
    )

    print(
        f"Categorical features: {len(categorical_features)}"
    )

    print(
        f"Training rows: {len(X):,}"
    )

    return (
        X,
        y,
        numerical_features,
        categorical_features
    )


# ============================================================
# BUILD MODEL
# ============================================================

def build_model(
    numerical_features,
    categorical_features
):

    print()
    print("=" * 70)
    print("BUILDING LOGISHIELD V2 MODEL")
    print("=" * 70)

    numerical_pipeline = Pipeline(
        steps=[
            (
                "imputer",
                SimpleImputer(
                    strategy="median"
                )
            )
        ]
    )

    categorical_pipeline = Pipeline(
        steps=[
            (
                "imputer",
                SimpleImputer(
                    strategy="most_frequent"
                )
            ),
            (
                "encoder",
                OneHotEncoder(
                    handle_unknown="ignore",
                    sparse_output=True
                )
            )
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[

            (
                "numeric",
                numerical_pipeline,
                numerical_features
            ),

            (
                "categorical",
                categorical_pipeline,
                categorical_features
            )
        ]
    )

    classifier = RandomForestClassifier(

        n_estimators=350,

        max_depth=22,

        min_samples_leaf=3,

        max_features="sqrt",

        class_weight="balanced",

        random_state=42,

        n_jobs=-1
    )

    model = Pipeline(
        steps=[

            (
                "preprocessor",
                preprocessor
            ),

            (
                "classifier",
                classifier
            )
        ]
    )

    print()
    print(
        "Algorithm: Random Forest"
    )

    print(
        "Trees: 350"
    )

    print(
        "Maximum depth: 22"
    )

    print(
        "Class balancing: enabled"
    )

    return model


# ============================================================
# TRAIN MODEL
# ============================================================

def train_model(
    model,
    X,
    y
):

    print()
    print("=" * 70)
    print("TRAIN / TEST SPLIT")
    print("=" * 70)

    X_train, X_test, y_train, y_test = (
        train_test_split(

            X,
            y,

            test_size=0.20,

            random_state=42,

            stratify=y
        )
    )

    print()
    print(
        f"Training samples: {len(X_train):,}"
    )

    print(
        f"Testing samples:  {len(X_test):,}"
    )

    print()
    print("=" * 70)
    print("TRAINING LOGISHIELD V2")
    print("=" * 70)

    start = time.time()

    model.fit(
        X_train,
        y_train
    )

    elapsed = (
        time.time()
        -
        start
    )

    print()
    print(
        f"Training completed in {elapsed:.2f} seconds."
    )

    return (
        model,
        X_train,
        X_test,
        y_train,
        y_test
    )


# ============================================================
# EVALUATION
# ============================================================

def evaluate_model(
    model,
    X_test,
    y_test
):

    print()
    print("=" * 70)
    print("LOGISHIELD V2 MODEL EVALUATION")
    print("=" * 70)

    predictions = model.predict(
        X_test
    )

    probabilities = model.predict_proba(
        X_test
    )[:, 1]

    accuracy = accuracy_score(
        y_test,
        predictions
    )

    precision = precision_score(
        y_test,
        predictions,
        zero_division=0
    )

    recall = recall_score(
        y_test,
        predictions,
        zero_division=0
    )

    f1 = f1_score(
        y_test,
        predictions,
        zero_division=0
    )

    auc = roc_auc_score(
        y_test,
        probabilities
    )

    print()
    print(
        f"Accuracy : {accuracy:.4f}"
    )

    print(
        f"Precision: {precision:.4f}"
    )

    print(
        f"Recall   : {recall:.4f}"
    )

    print(
        f"F1 Score : {f1:.4f}"
    )

    print(
        f"ROC-AUC  : {auc:.4f}"
    )

    print()
    print(
        "Classification Report:"
    )

    print()

    print(
        classification_report(
            y_test,
            predictions,
            target_names=[
                "ON_TIME",
                "DELAYED"
            ],
            zero_division=0
        )
    )

    print(
        "Confusion Matrix:"
    )

    print()

    matrix = confusion_matrix(
        y_test,
        predictions
    )

    print(
        matrix
    )

    metrics = {

        "accuracy":
            float(accuracy),

        "precision":
            float(precision),

        "recall":
            float(recall),

        "f1_score":
            float(f1),

        "roc_auc":
            float(auc),

        "confusion_matrix":
            matrix.tolist()
    }

    return metrics


# ============================================================
# FEATURE IMPORTANCE
# ============================================================

def get_feature_importance(
    model,
    numerical_features,
    categorical_features
):

    print()
    print("=" * 70)
    print("CALCULATING FEATURE IMPORTANCE")
    print("=" * 70)

    preprocessor = (
        model.named_steps[
            "preprocessor"
        ]
    )

    classifier = (
        model.named_steps[
            "classifier"
        ]
    )

    feature_names = (
        preprocessor
        .get_feature_names_out()
    )

    importances = (
        classifier.feature_importances_
    )

    importance_df = pd.DataFrame({

        "feature":
            feature_names,

        "importance":
            importances
    })

    importance_df = (
        importance_df
        .sort_values(
            "importance",
            ascending=False
        )
        .reset_index(
            drop=True
        )
    )

    print()
    print(
        "Top 20 features:"
    )

    print()

    print(
        importance_df.head(20)
        .to_string(
            index=False
        )
    )

    return importance_df


# ============================================================
# SAVE MODEL
# ============================================================

def save_model(
    model,
    metrics,
    importance_df,
    numerical_features,
    categorical_features,
    training_rows
):

    print()
    print("=" * 70)
    print("SAVING LOGISHIELD V2 MODEL")
    print("=" * 70)

    joblib.dump(
        model,
        MODEL_FILE
    )

    top_features = []

    for _, row in (
        importance_df
        .head(20)
        .iterrows()
    ):

        top_features.append({

            "feature":
                str(row["feature"]),

            "importance":
                float(row["importance"])
        })

    metadata = {

        "project":
            "LogiShield",

        "model_name":
            "Shipment Delay Predictor V2",

        "model_type":
            "RandomForestClassifier",

        "model_version":
            "2.0.0",

        "training_rows":
            int(training_rows),

        "target":
            "delay_target",

        "target_definition":
            "1 when actual delivery occurs after expected delivery time",

        "leakage_protection":
            True,

        "numerical_features":
            numerical_features,

        "categorical_features":
            categorical_features,

        "metrics":
            metrics,

        "top_features":
            top_features
    }

    with open(
        METADATA_FILE,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            metadata,
            file,
            indent=4
        )

    importance_file = (
        MODEL_DIR
        /
        "feature_importance_v2.csv"
    )

    importance_df.to_csv(
        importance_file,
        index=False
    )

    print()
    print(
        f"Model saved:\n{MODEL_FILE}"
    )

    print()
    print(
        f"Metadata saved:\n{METADATA_FILE}"
    )

    print()
    print(
        f"Feature importance saved:\n{importance_file}"
    )


# ============================================================
# SAVE DATA
# ============================================================

def save_training_data(df):

    print()
    print("=" * 70)
    print("SAVING TRAINING DATA")
    print("=" * 70)

    output_columns = [

        "shipment_id",
        "shipment_code",

        "departure_time",
        "expected_delivery_time",
        "actual_delivery_time",

        "actual_delay_hours",
        "delay_target",

        "product_category",

        "source_city",
        "source_state",

        "destination_city",
        "destination_state",

        "vehicle_type",

        "distance_km",
        "estimated_time_hours",

        "route_risk_score",

        "quantity_units",
        "weight_kg",
        "capacity_kg",

        "vehicle_utilization",

        "weather_condition",
        "weather_severity",

        "traffic_level",
        "traffic_severity",

        "active_disruptions",
        "max_disruption_severity",

        "departure_hour",
        "departure_day_of_week",
        "departure_month",

        "is_weekend",
        "is_peak_departure",

        "is_monsoon",
        "is_festival_season",

        "has_active_disruption",
        "has_severe_disruption",

        "has_bad_weather",
        "has_heavy_traffic",

        "weather_traffic_interaction",

        "disruption_weather_interaction",

        "disruption_traffic_interaction",

        "shipment_value"
    ]

    available_columns = [

        column

        for column in output_columns

        if column in df.columns
    ]

    df[
        available_columns
    ].to_csv(

        FEATURE_DATA_FILE,

        index=False
    )

    print()

    print(
        f"Training dataset saved:\n"
        f"{FEATURE_DATA_FILE}"
    )


# ============================================================
# MAIN
# ============================================================

def main():

    overall_start = time.time()

    print()
    print("=" * 70)
    print("LOGISHIELD SHIPMENT DELAY PREDICTION V2")
    print("=" * 70)

    print()
    print(
        f"Project root: {PROJECT_ROOT}"
    )

    print(
        f"Model directory: {MODEL_DIR}"
    )

    print()
    print(
        "Leakage protection: ENABLED"
    )

    engine = create_database_engine()

    try:

        # ----------------------------------------------------
        # LOAD
        # ----------------------------------------------------

        df = load_data(
            engine
        )

        # ----------------------------------------------------
        # CLEAN
        # ----------------------------------------------------

        df = clean_data(
            df
        )

        # ----------------------------------------------------
        # TARGET
        # ----------------------------------------------------

        df = create_target(
            df
        )

        # ----------------------------------------------------
        # FEATURES
        # ----------------------------------------------------

        df = create_features(
            df
        )

        # ----------------------------------------------------
        # PREPARE
        # ----------------------------------------------------

        (
            X,
            y,
            numerical_features,
            categorical_features
        ) = prepare_ml_data(
            df
        )

        # ----------------------------------------------------
        # MODEL
        # ----------------------------------------------------

        model = build_model(
            numerical_features,
            categorical_features
        )

        # ----------------------------------------------------
        # TRAIN
        # ----------------------------------------------------

        (
            model,
            X_train,
            X_test,
            y_train,
            y_test
        ) = train_model(
            model,
            X,
            y
        )

        # ----------------------------------------------------
        # EVALUATE
        # ----------------------------------------------------

        metrics = evaluate_model(
            model,
            X_test,
            y_test
        )

        # ----------------------------------------------------
        # FEATURE IMPORTANCE
        # ----------------------------------------------------

        importance_df = get_feature_importance(
            model,
            numerical_features,
            categorical_features
        )

        # ----------------------------------------------------
        # SAVE
        # ----------------------------------------------------

        save_model(
            model,
            metrics,
            importance_df,
            numerical_features,
            categorical_features,
            len(X_train)
        )

        save_training_data(
            df
        )

        # ----------------------------------------------------
        # COMPLETE
        # ----------------------------------------------------

        elapsed = (
            time.time()
            -
            overall_start
        )

        print()
        print("=" * 70)
        print("LOGISHIELD V2 ML TRAINING COMPLETE")
        print("=" * 70)

        print()

        print(
            f"Total runtime: "
            f"{elapsed / 60:.2f} minutes"
        )

        print()
        print(
            "FINAL MODEL METRICS"
        )

        print()

        print(
            f"Accuracy : "
            f"{metrics['accuracy']:.4f}"
        )

        print(
            f"Precision: "
            f"{metrics['precision']:.4f}"
        )

        print(
            f"Recall   : "
            f"{metrics['recall']:.4f}"
        )

        print(
            f"F1 Score : "
            f"{metrics['f1_score']:.4f}"
        )

        print(
            f"ROC-AUC  : "
            f"{metrics['roc_auc']:.4f}"
        )

        print()
        print(
            "MODEL STATUS: READY"
        )

        print()

    finally:

        engine.dispose()


if __name__ == "__main__":

    main()