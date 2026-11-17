import getpass
import os
import re

import mysql.connector
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


def main() -> None:
    email = os.getenv("BOOTSTRAP_ADMIN_EMAIL") or input("Super admin email: ").strip().lower()
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD") or getpass.getpass("Password (12+ characters): ")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise SystemExit("Enter a valid email address.")
    if len(password) < 12:
        raise SystemExit("Password must contain at least 12 characters.")
    connection = mysql.connector.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3306")),
        database=os.getenv("DB_NAME", "evaluation_system"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
    )
    try:
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO users (email, password_hash, role, active) "
            "VALUES (%s, %s, 'super_admin', 1)",
            (email, generate_password_hash(password)),
        )
        connection.commit()
        cursor.close()
    finally:
        connection.close()
    print("Super admin account created. Run this command again for the second admin account.")


if __name__ == "__main__":
    main()
