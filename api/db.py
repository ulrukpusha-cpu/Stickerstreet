"""
Connexion Neon (Postgres) pour l'API StickerStreet.
Utilise DATABASE_URL (connection string Neon) pour stocker les données
dans une table kv_store au lieu du fichier JSON.
"""
import os
import json

_conn = None
_DATABASE_URL = (os.environ.get("DATABASE_URL") or "").strip()


def get_connection():
    """Retourne une connexion psycopg2 (créée une seule fois)."""
    global _conn
    if not _DATABASE_URL:
        return None
    if _conn is not None and not _conn.closed:
        return _conn
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        # Neon exige sslmode=require
        url = _DATABASE_URL
        if "sslmode=" not in url and "?" not in url:
            url = url + "?sslmode=require"
        elif "sslmode=" not in url:
            url = url + "&sslmode=require"
        _conn = psycopg2.connect(url, cursor_factory=RealDictCursor)
        _conn.autocommit = True
        _ensure_table(_conn)
        return _conn
    except Exception:
        _conn = None
        return None


def _ensure_table(conn):
    """Crée la table kv_store si elle n'existe pas."""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS kv_store (
                    key TEXT PRIMARY KEY,
                    value JSONB NOT NULL DEFAULT '{}'
                )
            """)
            cur.execute(
                "INSERT INTO kv_store (key, value) VALUES ('data', %s::jsonb) ON CONFLICT (key) DO NOTHING",
                (json.dumps(_default_data(), ensure_ascii=False),),
            )
    except Exception:
        pass


def is_neon_configured():
    """True si DATABASE_URL est défini."""
    return bool(_DATABASE_URL)


def load_data():
    """Charge les données depuis Neon (table kv_store, clé 'data')."""
    conn = get_connection()
    if not conn:
        return None
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT value FROM kv_store WHERE key = %s", ("data",))
            row = cur.fetchone()
            if row and row.get("value") is not None:
                val = row["value"]
                return val if isinstance(val, dict) else _default_data()
            return _default_data()
    except Exception:
        return _default_data()


def save_data(data):
    """Enregistre les données dans Neon."""
    conn = get_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO kv_store (key, value) VALUES (%s, %s::jsonb)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """,
                ("data", json.dumps(data, ensure_ascii=False)),
            )
        return True
    except Exception:
        return False


def _default_data():
    """Structure minimale si la table est vide ou absente."""
    return {
        "products": [],
        "orders": [],
        "statuses": {
            "pending": {"label": "En attente", "color": "#F59E0B", "icon": "⏳"},
            "confirmed": {"label": "Confirmée", "color": "#00B894", "icon": "✅"},
            "production": {"label": "En production", "color": "#E17055", "icon": "🔧"},
            "shipped": {"label": "Expédiée", "color": "#0984E3", "icon": "📦"},
            "delivered": {"label": "Livrée", "color": "#00CEC9", "icon": "🎉"},
        },
        "momo": [],
        "clients": [],
        "chat": [],
        "banners": [],
        "invoices": [],
        "pending_invoices": {},
    }
