from pathlib import Path


PROJECT_ROOT = Path(r"C:\LogiShield")

MAIN_FILE = (
    PROJECT_ROOT
    / "backend"
    / "main.py"
)


ROUTES_ENDPOINT = r'''

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

'''


def main():

    print("=" * 70)
    print("LOGISHIELD ROUTE API INSTALLER")
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

    if '@app.get("/api/v1/routes")' in original:

        print()
        print(
            "[OK] /api/v1/routes already exists."
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
            "was not found in backend/main.py."
        )

        print()
        print(
            "The file was NOT modified."
        )

        return

    updated = original.replace(
        marker,
        ROUTES_ENDPOINT
        + "\n"
        + marker,
        1
    )

    backup_file = (
        PROJECT_ROOT
        / "backend"
        / "main.py.backup"
    )

    backup_file.write_text(
        original,
        encoding="utf-8"
    )

    MAIN_FILE.write_text(
        updated,
        encoding="utf-8"
    )

    print()
    print(
        "[OK] Route Intelligence API added."
    )

    print()
    print(
        f"[OK] Backup created:"
    )

    print(
        f"     {backup_file}"
    )

    print()
    print(
        "New endpoint:"
    )

    print(
        "     GET /api/v1/routes"
    )

    print()
    print(
        "Expected URL:"
    )

    print(
        "     http://127.0.0.1:8000/api/v1/routes"
    )

    print()
    print("=" * 70)
    print(
        "INSTALLATION COMPLETE"
    )
    print("=" * 70)


if __name__ == "__main__":
    main()