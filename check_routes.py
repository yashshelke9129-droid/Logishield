import psycopg2
from getpass import getpass

print("=" * 60)
print("LOGISHIELD ROUTE DUPLICATE CHECK")
print("=" * 60)

password = getpass("PostgreSQL password for postgres: ")

try:
    conn = psycopg2.connect(
        host="localhost",
        port=5432,
        database="logishield",
        user="postgres",
        password=password
    )

    print("\n[OK] PostgreSQL connection established.")

    cur = conn.cursor()

    cur.execute("""
        SELECT
            source_location_id,
            destination_location_id,
            COUNT(*) AS route_count
        FROM routes
        GROUP BY source_location_id, destination_location_id
        HAVING COUNT(*) > 1
        ORDER BY route_count DESC;
    """)

    rows = cur.fetchall()

    if rows:
        print("\n[WARNING] Duplicate source/destination route combinations found:")
        print("-" * 60)

        for source_id, destination_id, count in rows:
            print(
                f"Source Location: {source_id} | "
                f"Destination Location: {destination_id} | "
                f"Routes: {count}"
            )
    else:
        print("\n[OK] No duplicate source/destination route combinations found.")

    cur.close()
    conn.close()

    print("\n[OK] Database connection closed.")

except psycopg2.Error as e:
    print("\n[ERROR] PostgreSQL error:")
    print(e)