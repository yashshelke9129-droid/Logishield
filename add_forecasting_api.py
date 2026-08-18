from pathlib import Path


PROJECT_ROOT = Path(r"C:\LogiShield")

MAIN_FILE = (
    PROJECT_ROOT
    / "backend"
    / "main.py"
)


FORECASTING_ENDPOINT = r'''

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

'''


def main():

    print("=" * 70)
    print("LOGISHIELD FORECASTING API INSTALLER")
    print("=" * 70)

    print()
    print(
        f"Main file: {MAIN_FILE}"
    )

    if not MAIN_FILE.exists():

        print()
        print(
            "[ERROR] backend/main.py was not found."
        )

        return

    original = MAIN_FILE.read_text(
        encoding="utf-8"
    )

    if (
        '@app.get("/api/v1/forecasting")'
        in original
    ):

        print()
        print(
            "[OK] /api/v1/forecasting already exists."
        )

        print()
        print(
            "Nothing was changed."
        )

        return

    marker = (
        "# ============================================================\n"
        "# DASHBOARD OVERVIEW API\n"
        "# ============================================================\n"
    )

    if marker not in original:

        print()
        print(
            "[ERROR] Dashboard Overview section "
            "was not found."
        )

        print()
        print(
            "The file was NOT modified."
        )

        return

    backup_file = (
        PROJECT_ROOT
        / "backend"
        / "main.py.before_forecasting"
    )

    backup_file.write_text(
        original,
        encoding="utf-8"
    )

    updated = original.replace(
        marker,
        FORECASTING_ENDPOINT
        + "\n"
        + marker,
        1
    )

    MAIN_FILE.write_text(
        updated,
        encoding="utf-8"
    )

    print()
    print(
        "[OK] Forecasting API added."
    )

    print()
    print(
        "[OK] Backup created:"
    )

    print(
        f"     {backup_file}"
    )

    print()
    print(
        "New endpoint:"
    )

    print(
        "     GET /api/v1/forecasting"
    )

    print()
    print(
        "Expected URL:"
    )

    print(
        "     http://127.0.0.1:8000/api/v1/forecasting"
    )

    print()
    print("=" * 70)
    print(
        "INSTALLATION COMPLETE"
    )
    print("=" * 70)


if __name__ == "__main__":
    main()