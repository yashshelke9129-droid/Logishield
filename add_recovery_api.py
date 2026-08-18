from pathlib import Path


PROJECT_ROOT = Path(r"C:\LogiShield")

MAIN_FILE = (
    PROJECT_ROOT
    / "backend"
    / "main.py"
)


RECOVERY_ENDPOINT = r'''

# ============================================================
# RECOVERY CENTER API
# ============================================================

@app.get("/api/v1/recovery/plans")
def recovery_plans(
    limit: int = 100
):
    """
    Return live recovery plans from PostgreSQL.

    Source:
        recovery_plans

    Joined with:
        shipments
        shipment_risk_predictions
        locations
        routes
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
            rp.*,

            s.shipment_code,
            s.status AS shipment_status,

            src.city AS source_city,
            src.state AS source_state,

            dst.city AS destination_city,
            dst.state AS destination_state,

            p.delay_probability,
            p.risk_score,
            p.risk_level,
            p.predicted_delay_hours,

            r.route_code,
            r.distance_km,
            r.estimated_time_hours,
            r.base_cost,
            r.route_status,
            r.risk_score AS route_risk_score

        FROM recovery_plans rp

        LEFT JOIN shipments s
            ON s.shipment_id =
               rp.shipment_id

        LEFT JOIN shipment_risk_predictions p
            ON p.shipment_id =
               rp.shipment_id

        LEFT JOIN locations src
            ON src.location_id =
               s.source_location_id

        LEFT JOIN locations dst
            ON dst.location_id =
               s.destination_location_id

        LEFT JOIN routes r
            ON r.route_id =
               s.route_id

        ORDER BY
            p.delay_probability DESC NULLS LAST,
            rp.created_at DESC NULLS LAST

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
                "Failed to load recovery plans: "
                f"{str(error)}"
            )
        )

    plans = []

    for row in rows:

        record = {}

        # ----------------------------------------------------
        # RETURN ALL RECOVERY PLAN COLUMNS
        # ----------------------------------------------------

        for key, value in row.items():

            if key in {
                "delay_probability",
                "risk_score",
                "predicted_delay_hours",
                "route_risk_score",
                "distance_km",
                "estimated_time_hours",
                "base_cost"
            }:

                record[key] = safe_float(
                    value
                )

            elif key in {
                "shipment_id",
                "vehicle_id",
                "route_id"
            }:

                record[key] = safe_int(
                    value
                )

            elif key in {
                "created_at",
                "updated_at"
            }:

                record[key] = safe_datetime(
                    value
                )

            else:

                if value is None:
                    record[key] = None

                else:
                    record[key] = str(value)

        # ----------------------------------------------------
        # NORMALIZED FRONTEND FIELDS
        # ----------------------------------------------------

        probability = safe_float(
            row.get(
                "delay_probability"
            )
        )

        record["delay_probability_percentage"] = round(
            probability * 100,
            2
        )

        record["recovery_priority"] = (
            "CRITICAL"
            if probability >= 0.75
            else
            "HIGH"
            if probability >= 0.50
            else
            "MEDIUM"
            if probability >= 0.25
            else
            "LOW"
        )

        plans.append(
            record
        )

    # --------------------------------------------------------
    # SUMMARY STATISTICS
    # --------------------------------------------------------

    total_plans = len(plans)

    critical_plans = sum(
        1
        for plan in plans
        if plan.get(
            "recovery_priority"
        ) == "CRITICAL"
    )

    high_plans = sum(
        1
        for plan in plans
        if plan.get(
            "recovery_priority"
        ) == "HIGH"
    )

    medium_plans = sum(
        1
        for plan in plans
        if plan.get(
            "recovery_priority"
        ) == "MEDIUM"
    )

    low_plans = sum(
        1
        for plan in plans
        if plan.get(
            "recovery_priority"
        ) == "LOW"
    )

    return {

        "system":
            "LogiShield",

        "module":
            "Recovery Center",

        "status":
            "operational",

        "summary": {

            "total_plans":
                total_plans,

            "critical":
                critical_plans,

            "high":
                high_plans,

            "medium":
                medium_plans,

            "low":
                low_plans

        },

        "plans":
            plans,

        "timestamp":
            datetime.utcnow().isoformat()
            + "Z"

    }

'''


def main():

    print("=" * 70)
    print("LOGISHIELD RECOVERY CENTER API INSTALLER")
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
        '@app.get("/api/v1/recovery/plans")'
        in original
    ):

        print()
        print(
            "[OK] /api/v1/recovery/plans already exists."
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
        / "main.py.before_recovery"
    )

    backup_file.write_text(
        original,
        encoding="utf-8"
    )

    updated = original.replace(
        marker,
        RECOVERY_ENDPOINT
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
        "[OK] Recovery Center API added."
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
        "     GET /api/v1/recovery/plans"
    )

    print()
    print(
        "Expected URL:"
    )

    print(
        "     http://127.0.0.1:8000/api/v1/recovery/plans"
    )

    print()
    print("=" * 70)
    print(
        "INSTALLATION COMPLETE"
    )
    print("=" * 70)


if __name__ == "__main__":
    main()