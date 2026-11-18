import os
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv

env_file = ".env.production" if os.getenv("APP_ENV") == "production" else ".env"
load_dotenv(Path(__file__).with_name(env_file))


def main() -> None:
    connection = mysql.connector.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3306")),
        database=os.getenv("DB_NAME", "evaluation_system"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
    )
    cursor = connection.cursor(buffered=True)
    try:
        seed_sql = Path(__file__).with_name("seed_capsu_data.sql").read_text(encoding="utf-8")
        for statement in seed_sql.split(";"):
            statement = statement.strip()
            if statement:
                cursor.execute(statement)
                if cursor.with_rows:
                    cursor.fetchall()
        connection.commit()
    finally:
        cursor.close()
        connection.close()
    print("CAPSU campuses, offices, administrators, and evaluation targets are ready.")


if __name__ == "__main__":
    main()
