"""
LogiShield V2 Training Data Improvement
=======================================

Purpose:
    Improve the synthetic shipment data so that the ML model
    can learn meaningful relationships between operational
    conditions and shipment delays.

This script:

1. Adds operational condition columns to shipments.
2. Generates weather conditions.
3. Generates traffic conditions.
4. Detects active disruptions.
5. Calculates disruption severity.
6. Calculates operational risk.
7. Re-generates realistic shipment delays.
8. Produces a substantially more balanced target.

Run:

    cd C:\LogiShield\backend
    python improve_training_data.py
"""

from __future__ import annotations

import math
import os
import random
import sys
import time
from datetime import datetime

import numpy as np
import psycopg2
from dotenv import load_dotenv


# ============================================================
# CONFIGURATION
# ============================================================

SEED = 42

random.seed(SEED)
np.random.seed(SEED)

BACKEND_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

ENV_FILE = os.path.join(
    BACKEND_DIR,
    ".env"
)

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

def connect_database():

    if not DB_PASSWORD:

        print()
        print("=" * 70)
        print("DATABASE PASSWORD NOT FOUND")
        print("=" * 70)
        print()
        print(
            f"Check this file:\n{ENV_FILE}"
        )

        sys.exit(1)

    try:

        connection = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )

        connection.autocommit = False

        return connection

    except Exception as error:

        print()
        print("=" * 70)
        print("DATABASE CONNECTION FAILED")
        print("=" * 70)
        print()
        print(error)

        sys.exit(1)


# ============================================================
# DATABASE STRUCTURE
# ============================================================

def add_columns(cursor):

    print()
    print("=" * 70)
    print("ADDING LOGISHIELD V2 OPERATIONAL FEATURES")
    print("=" * 70)

    statements = [

        """
        ALTER TABLE shipments
        ADD COLUMN IF NOT EXISTS weather_condition VARCHAR(50);
        """,

        """
        ALTER TABLE shipments
        ADD COLUMN IF NOT EXISTS weather_severity INTEGER;
        """,

        """
        ALTER TABLE shipments
        ADD COLUMN IF NOT EXISTS traffic_level VARCHAR(50);
        """,

        """
        ALTER TABLE shipments
        ADD COLUMN IF NOT EXISTS traffic_severity INTEGER;
        """,

        """
        ALTER TABLE shipments
        ADD COLUMN IF NOT EXISTS active_disruptions INTEGER
        DEFAULT 0;
        """,

        """
        ALTER TABLE shipments
        ADD COLUMN IF NOT EXISTS max_disruption_severity INTEGER
        DEFAULT 0;
        """,

        """
        ALTER TABLE shipments
        ADD COLUMN IF NOT EXISTS operational_risk_score DOUBLE PRECISION
        DEFAULT 0;
        """,

        """
        ALTER TABLE shipments
        ADD COLUMN IF NOT EXISTS delay_probability_simulated DOUBLE PRECISION
        DEFAULT 0;
        """,

        """
        ALTER TABLE shipments
        ADD COLUMN IF NOT EXISTS condition_version VARCHAR(20)
        DEFAULT 'V2';
        """
    ]

    for statement in statements:

        cursor.execute(statement)

    print()
    print(
        "Operational columns are ready."
    )


# ============================================================
# WEATHER
# ============================================================

def get_weather(
    month: int,
    city: str
):

    monsoon_cities = {
        "Mumbai",
        "Pune",
        "Nashik",
        "Nagpur",
        "Ahmedabad",
        "Surat",
        "Vadodara",
        "Kochi",
        "Goa",
        "Bengaluru",
        "Chennai",
        "Hyderabad",
        "Visakhapatnam",
        "Bhubaneswar",
        "Kolkata",
        "Guwahati"
    }

    if month in [6, 7, 8, 9]:

        if city in monsoon_cities:

            options = [
                ("CLEAR", 0, 0.38),
                ("CLOUDY", 1, 0.25),
                ("HEAVY_RAIN", 3, 0.27),
                ("STORM", 5, 0.10)
            ]

        else:

            options = [
                ("CLEAR", 0, 0.48),
                ("CLOUDY", 1, 0.27),
                ("HEAVY_RAIN", 3, 0.20),
                ("STORM", 5, 0.05)
            ]

    elif month in [10, 11]:

        options = [
            ("CLEAR", 0, 0.55),
            ("CLOUDY", 1, 0.25),
            ("LIGHT_RAIN", 2, 0.15),
            ("HEAVY_RAIN", 3, 0.05)
        ]

    else:

        options = [
            ("CLEAR", 0, 0.68),
            ("CLOUDY", 1, 0.20),
            ("LIGHT_RAIN", 2, 0.10),
            ("HEAVY_RAIN", 3, 0.02)
        ]

    names = [
        item[0]
        for item in options
    ]

    severities = [
        item[1]
        for item in options
    ]

    weights = [
        item[2]
        for item in options
    ]

    index = random.choices(
        range(len(options)),
        weights=weights,
        k=1
    )[0]

    return (
        names[index],
        severities[index]
    )


# ============================================================
# TRAFFIC
# ============================================================

def get_traffic(
    departure_hour: int,
    day_of_week: int
):

    if day_of_week >= 5:

        options = [
            ("LOW", 0, 0.45),
            ("NORMAL", 1, 0.35),
            ("HIGH", 2, 0.16),
            ("SEVERE", 4, 0.04)
        ]

    elif (
        7 <= departure_hour <= 10
        or
        17 <= departure_hour <= 21
    ):

        options = [
            ("LOW", 0, 0.05),
            ("NORMAL", 1, 0.20),
            ("HIGH", 2, 0.50),
            ("SEVERE", 4, 0.25)
        ]

    else:

        options = [
            ("LOW", 0, 0.25),
            ("NORMAL", 1, 0.50),
            ("HIGH", 2, 0.22),
            ("SEVERE", 4, 0.03)
        ]

    names = [
        item[0]
        for item in options
    ]

    severities = [
        item[1]
        for item in options
    ]

    weights = [
        item[2]
        for item in options
    ]

    index = random.choices(
        range(len(options)),
        weights=weights,
        k=1
    )[0]

    return (
        names[index],
        severities[index]
    )


# ============================================================
# DISRUPTION SEVERITY
# ============================================================

def calculate_disruption_effect(
    disruptions
):

    if not disruptions:

        return 0, 0

    severity_map = {
        "LOW": 1,
        "MEDIUM": 2,
        "HIGH": 4,
        "CRITICAL": 7
    }

    severities = []

    for disruption in disruptions:

        severity = disruption[
            "severity"
        ]

        severities.append(
            severity_map.get(
                severity,
                0
            )
        )

    return (
        len(disruptions),
        max(severities)
    )


# ============================================================
# MAIN PROCESS
# ============================================================

def main():

    start_time = time.time()

    print()
    print("=" * 70)
    print("LOGISHIELD V2 TRAINING DATA IMPROVEMENT")
    print("=" * 70)

    print()
    print(
        f"Database: {DB_NAME}"
    )

    print(
        f"Random seed: {SEED}"
    )

    connection = connect_database()

    try:

        cursor = connection.cursor()

        # ----------------------------------------------------
        # ADD COLUMNS
        # ----------------------------------------------------

        add_columns(cursor)

        # ----------------------------------------------------
        # LOAD LOCATIONS
        # ----------------------------------------------------

        print()
        print(
            "Loading locations..."
        )

        cursor.execute(
            """
            SELECT
                location_id,
                city
            FROM locations;
            """
        )

        locations = {
            row[0]: row[1]
            for row in cursor.fetchall()
        }

        print(
            f"Locations loaded: {len(locations)}"
        )

        # ----------------------------------------------------
        # LOAD ROUTES
        # ----------------------------------------------------

        print(
            "Loading routes..."
        )

        cursor.execute(
            """
            SELECT
                route_id,
                risk_score
            FROM routes;
            """
        )

        routes = {
            row[0]: float(row[1])
            for row in cursor.fetchall()
        }

        print(
            f"Routes loaded: {len(routes)}"
        )

        # ----------------------------------------------------
        # LOAD DISRUPTIONS
        # ----------------------------------------------------

        print(
            "Loading disruptions..."
        )

        cursor.execute(
            """
            SELECT
                disruption_id,
                route_id,
                location_id,
                severity,
                start_time,
                end_time
            FROM disruptions;
            """
        )

        disruption_rows = (
            cursor.fetchall()
        )

        disruptions_by_route = {}

        disruptions_by_location = {}

        for row in disruption_rows:

            disruption = {
                "id": row[0],
                "route_id": row[1],
                "location_id": row[2],
                "severity": row[3],
                "start": row[4],
                "end": row[5]
            }

            if row[1] is not None:

                disruptions_by_route.setdefault(
                    row[1],
                    []
                ).append(
                    disruption
                )

            if row[2] is not None:

                disruptions_by_location.setdefault(
                    row[2],
                    []
                ).append(
                    disruption
                )

        print(
            f"Disruptions loaded: {len(disruption_rows):,}"
        )

        # ----------------------------------------------------
        # LOAD SHIPMENTS
        # ----------------------------------------------------

        print()
        print(
            "Loading shipments..."
        )

        cursor.execute(
            """
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
                s.actual_delivery_time,
                s.status,
                r.route_id,
                r.distance_km,
                r.estimated_time_hours,
                r.risk_score,
                v.capacity_kg
            FROM shipments s

            JOIN routes r
              ON r.source_location_id =
                 s.source_location_id
             AND r.destination_location_id =
                 s.destination_location_id

            JOIN vehicles v
              ON v.vehicle_id =
                 s.vehicle_id

            ORDER BY s.shipment_id;
            """
        )

        shipments = cursor.fetchall()

        total = len(shipments)

        print(
            f"Shipments loaded: {total:,}"
        )

        # ----------------------------------------------------
        # PROCESS SHIPMENTS
        # ----------------------------------------------------

        print()
        print(
            "Generating operational conditions..."
        )

        delayed_count = 0

        batch_size = 1000

        updates = []

        for index, shipment in enumerate(
            shipments,
            start=1
        ):

            (
                shipment_id,
                shipment_code,
                source_location_id,
                destination_location_id,
                vehicle_id,
                quantity_units,
                weight_kg,
                departure_time,
                expected_delivery_time,
                old_actual_delivery_time,
                old_status,
                route_id,
                distance_km,
                estimated_time_hours,
                route_risk,
                capacity_kg
            ) = shipment

            # ------------------------------------------------
            # CITY
            # ------------------------------------------------

            source_city = locations.get(
                source_location_id,
                ""
            )

            destination_city = locations.get(
                destination_location_id,
                ""
            )

            # ------------------------------------------------
            # WEATHER
            # ------------------------------------------------

            weather_source = get_weather(
                departure_time.month,
                source_city
            )

            weather_destination = get_weather(
                departure_time.month,
                destination_city
            )

            weather_options = [
                weather_source,
                weather_destination
            ]

            weather_severity = max(
                item[1]
                for item in weather_options
            )

            if weather_severity == weather_source[1]:

                weather_condition = (
                    weather_source[0]
                )

            else:

                weather_condition = (
                    weather_destination[0]
                )

            # ------------------------------------------------
            # TRAFFIC
            # ------------------------------------------------

            traffic_condition, traffic_severity = (
                get_traffic(
                    departure_time.hour,
                    departure_time.weekday()
                )
            )

            # ------------------------------------------------
            # DISRUPTIONS
            # ------------------------------------------------

            route_disruptions = []

            for disruption in (
                disruptions_by_route.get(
                    route_id,
                    []
                )
            ):

                if (
                    disruption["start"]
                    <= departure_time
                    <= disruption["end"]
                ):

                    route_disruptions.append(
                        disruption
                    )

            source_disruptions = []

            for disruption in (
                disruptions_by_location.get(
                    source_location_id,
                    []
                )
            ):

                if (
                    disruption["start"]
                    <= departure_time
                    <= disruption["end"]
                ):

                    source_disruptions.append(
                        disruption
                    )

            destination_disruptions = []

            for disruption in (
                disruptions_by_location.get(
                    destination_location_id,
                    []
                )
            ):

                if (
                    disruption["start"]
                    <= departure_time
                    <= disruption["end"]
                ):

                    destination_disruptions.append(
                        disruption
                    )

            all_disruptions = (
                route_disruptions
                + source_disruptions
                + destination_disruptions
            )

            active_disruptions = len(
                all_disruptions
            )

            _, max_disruption_severity = (
                calculate_disruption_effect(
                    all_disruptions
                )
            )

            # ------------------------------------------------
            # VEHICLE UTILIZATION
            # ------------------------------------------------

            utilization = (
                float(weight_kg)
                / max(
                    float(capacity_kg),
                    1
                )
            )

            utilization = min(
                utilization,
                1.5
            )

            # ------------------------------------------------
            # OPERATIONAL RISK
            # ------------------------------------------------

            risk = 0.0

            # Route risk
            risk += (
                float(route_risk)
                * 0.35
            )

            # Weather
            risk += (
                weather_severity
                * 7.0
            )

            # Traffic
            risk += (
                traffic_severity
                * 5.0
            )

            # Disruptions
            risk += (
                active_disruptions
                * 9.0
            )

            risk += (
                max_disruption_severity
                * 4.0
            )

            # Vehicle utilization
            if utilization > 0.90:

                risk += 10

            elif utilization > 0.75:

                risk += 5

            # Peak traffic
            if (
                7 <= departure_time.hour <= 10
                or
                17 <= departure_time.hour <= 21
            ):

                risk += 3

            # Distance
            if distance_km > 1000:

                risk += 5

            elif distance_km > 600:

                risk += 3

            # Weekend reduction
            if departure_time.weekday() >= 5:

                risk -= 3

            risk += random.uniform(
                -3,
                3
            )

            risk = max(
                0,
                min(
                    100,
                    risk
                )
            )

            # ------------------------------------------------
            # DELAY PROBABILITY
            # ------------------------------------------------

            # Baseline around 8%.
            #
            # Operational conditions increase
            # probability.

            probability = (
                0.08
                + risk * 0.0042
            )

            # Strong disruption effect

            if active_disruptions >= 1:

                probability += 0.06

            if active_disruptions >= 2:

                probability += 0.08

            # Severe weather

            if weather_severity >= 3:

                probability += 0.08

            # Severe traffic

            if traffic_severity >= 4:

                probability += 0.07

            # High utilization

            if utilization > 0.90:

                probability += 0.04

            probability = max(
                0.02,
                min(
                    0.92,
                    probability
                )
            )

            # ------------------------------------------------
            # ACTUAL DELAY
            # ------------------------------------------------

            delayed = (
                random.random()
                < probability
            )

            if delayed:

                delayed_count += 1

                # Base delay

                delay_hours = np.random.gamma(
                    shape=1.8,
                    scale=1.5
                )

                # Risk increases delay

                delay_hours += (
                    risk
                    / 25
                )

                # Disruption increases delay

                delay_hours += (
                    active_disruptions
                    * random.uniform(
                        1.5,
                        4.0
                    )
                )

                # Weather

                delay_hours += (
                    weather_severity
                    * random.uniform(
                        0.4,
                        1.4
                    )
                )

                # Traffic

                delay_hours += (
                    traffic_severity
                    * random.uniform(
                        0.3,
                        1.2
                    )
                )

                delay_hours = max(
                    0.5,
                    min(
                        48,
                        delay_hours
                    )
                )

                actual_delivery = (
                    expected_delivery_time
                    + np.timedelta64(
                        int(
                            delay_hours
                            * 3600
                        ),
                        "s"
                    )
                )

                new_status = "DELAYED"

            else:

                early_hours = random.uniform(
                    0,
                    1.5
                )

                actual_delivery = (
                    expected_delivery_time
                    - np.timedelta64(
                        int(
                            early_hours
                            * 3600
                        ),
                        "s"
                    )
                )

                new_status = "DELIVERED"

            # ------------------------------------------------
            # UPDATE
            # ------------------------------------------------

            updates.append(
                (
                    weather_condition,
                    weather_severity,
                    traffic_condition,
                    traffic_severity,
                    active_disruptions,
                    max_disruption_severity,
                    round(
                        risk,
                        4
                    ),
                    round(
                        probability,
                        6
                    ),
                    actual_delivery,
                    new_status,
                    shipment_id
                )
            )

            # ------------------------------------------------
            # BATCH UPDATE
            # ------------------------------------------------

            if (
                len(updates)
                >= batch_size
                or index == total
            ):

                cursor.executemany(
                    """
                    UPDATE shipments
                    SET
                        weather_condition = %s,
                        weather_severity = %s,
                        traffic_level = %s,
                        traffic_severity = %s,
                        active_disruptions = %s,
                        max_disruption_severity = %s,
                        operational_risk_score = %s,
                        delay_probability_simulated = %s,
                        actual_delivery_time = %s,
                        status = %s,
                        condition_version = 'V2'
                    WHERE shipment_id = %s;
                    """,
                    updates
                )

                updates.clear()

            # ------------------------------------------------
            # PROGRESS
            # ------------------------------------------------

            if (
                index % 5000 == 0
                or index == total
            ):

                percentage = (
                    index
                    / total
                    * 100
                )

                print(
                    f"Processed "
                    f"{index:,}/{total:,} "
                    f"({percentage:5.1f}%)"
                )

        # ----------------------------------------------------
        # COMMIT
        # ----------------------------------------------------

        connection.commit()

        print()
        print("=" * 70)
        print("LOGISHIELD V2 DATA UPDATE COMPLETE")
        print("=" * 70)

        delay_percentage = (
            delayed_count
            / total
            * 100
        )

        print()
        print(
            f"Total shipments: {total:,}"
        )

        print(
            f"Delayed shipments: {delayed_count:,}"
        )

        print(
            f"Delay percentage: {delay_percentage:.2f}%"
        )

        print()
        print(
            "Operational features added:"
        )

        print(
            "  Weather condition"
        )

        print(
            "  Weather severity"
        )

        print(
            "  Traffic level"
        )

        print(
            "  Traffic severity"
        )

        print(
            "  Active disruptions"
        )

        print(
            "  Maximum disruption severity"
        )

        print(
            "  Operational risk score"
        )

        print(
            "  Simulated delay probability"
        )

        print()

        elapsed = (
            time.time()
            - start_time
        )

        print(
            f"Execution time: "
            f"{elapsed / 60:.2f} minutes"
        )

        print()
        print(
            "DATABASE STATUS: LOGISHIELD V2 READY"
        )

        cursor.close()

    except Exception as error:

        connection.rollback()

        print()
        print("=" * 70)
        print("LOGISHIELD V2 UPDATE FAILED")
        print("=" * 70)
        print()
        print(error)
        print()
        print(
            "All changes from this update "
            "have been rolled back."
        )

        raise

    finally:

        connection.close()


if __name__ == "__main__":

    main()