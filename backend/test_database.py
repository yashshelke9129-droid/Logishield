import os

import psycopg2
from dotenv import load_dotenv


load_dotenv()


DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")


def test_connection():
    connection = None

    try:
        connection = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
        )

        cursor = connection.cursor()

        cursor.execute("SELECT current_database();")
        database_name = cursor.fetchone()[0]

        cursor.execute("SELECT version();")
        database_version = cursor.fetchone()[0]

        print("=" * 60)
        print("LOGISHIELD DATABASE CONNECTION")
        print("=" * 60)

        print(f"Database: {database_name}")
        print(f"PostgreSQL: {database_version}")
        print("Status: CONNECTED")
        print("=" * 60)

        cursor.close()

    except Exception as error:
        print("=" * 60)
        print("DATABASE CONNECTION FAILED")
        print("=" * 60)
        print(error)
        print("=" * 60)

    finally:
        if connection is not None:
            connection.close()


if __name__ == "__main__":
    test_connection()