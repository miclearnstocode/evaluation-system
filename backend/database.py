from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Iterator

import mysql.connector
from dotenv import load_dotenv
from flask import current_app

load_dotenv(Path(__file__).with_name(".env"))


def connect(role: str):
    prefix = "SUBMIT_DB" if role == "submit" else "ADMIN_DB"
    user = os.getenv(f"{prefix}_USER") or os.getenv("DB_USER", "root")
    password = os.getenv(f"{prefix}_PASSWORD")
    if password is None:
        password = os.getenv("DB_PASSWORD", "")
    connection = mysql.connector.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3306")),
        database=os.getenv("DB_NAME", "evaluation_system"),
        user=user,
        password=password,
        autocommit=False,
    )
    cursor = connection.cursor()
    cursor.execute("SET time_zone = '+00:00'")
    cursor.close()
    return connection


@contextmanager
def connection(role: str = "admin") -> Iterator[Any]:
    factory: Callable[[str], Any] = current_app.config["DB_FACTORY"]
    conn = factory(role)
    try:
        yield conn
    finally:
        conn.close()


def fetch_one(cursor: Any, query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    cursor.execute(query, params)
    return cursor.fetchone()


def fetch_all(cursor: Any, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    cursor.execute(query, params)
    return list(cursor.fetchall())
