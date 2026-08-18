import psycopg2
from getpass import getpass

print("=" * 60)
print("LOGISHIELD DATABASE SCHEMA CHECK")
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

    for table in ["shipments", "routes"]:
        print(f"\n{'=' * 20} {table.upper()} {'=' * 20}")

        cur.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = %s
            ORDER BY ordinal_position;
        """, (table,))

        rows = cur.fetchall()

        if not rows:
            print(f"[WARNING] Table '{table}' was not found.")
        else:
            for column_name, data_type in rows:
                print(f"{column_name:<40} {data_type}")

    cur.close()
    conn.close()

    print("\n[OK] Database connection closed.")

except psycopg2.Error as e:
    print("\n[ERROR] PostgreSQL connection/query failed:")
    print(e)