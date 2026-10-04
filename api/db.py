import json
import os

import psycopg
from psycopg.rows import dict_row

KV_KEY = "data"


def is_database_enabled():
    return bool((os.environ.get("DATABASE_URL", "") or "").strip())


def _connect():
    database_url = (os.environ.get("DATABASE_URL", "") or "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL manquant")
    return psycopg.connect(database_url, autocommit=True, row_factory=dict_row, connect_timeout=10)


def _ensure_kv_table(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS kv_store (
                key TEXT PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        # Les tables créées via neon_schema.sql n'ont pas updated_at
        cur.execute("ALTER TABLE kv_store ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()")


def load_data(seed_loader):
    with _connect() as conn:
        _ensure_kv_table(conn)
        with conn.cursor() as cur:
            cur.execute("SELECT value FROM kv_store WHERE key = %s", (KV_KEY,))
            row = cur.fetchone()
            if row and row.get("value") is not None:
                value = row["value"]
                if isinstance(value, str):
                    return json.loads(value)
                return value

            seed = seed_loader()
            cur.execute(
                """
                INSERT INTO kv_store (key, value, updated_at)
                VALUES (%s, %s::jsonb, NOW())
                ON CONFLICT (key)
                DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
                """,
                (KV_KEY, json.dumps(seed, ensure_ascii=False)),
            )
            return seed


def save_data(data):
    with _connect() as conn:
        _ensure_kv_table(conn)
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO kv_store (key, value, updated_at)
                VALUES (%s, %s::jsonb, NOW())
                ON CONFLICT (key)
                DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
                """,
                (KV_KEY, json.dumps(data, ensure_ascii=False)),
            )
