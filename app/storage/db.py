"""SQLite persistence for searches, properties and photos.

Kept intentionally simple (plain sqlite3, no ORM) since this is a
single-user, single-process personal tool.
"""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    params_json TEXT NOT NULL,
    zillow_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT
);

CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_id INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
    zpid TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zipcode TEXT,
    price TEXT,
    beds REAL,
    baths REAL,
    sqft INTEGER,
    lot_size TEXT,
    year_built INTEGER,
    home_type TEXT,
    status_text TEXT,
    description TEXT,
    agent_name TEXT,
    agent_phone TEXT,
    listing_url TEXT,
    latitude REAL,
    longitude REAL,
    selected INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    source_url TEXT,
    local_path TEXT,
    caption TEXT,
    category TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);
"""


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.executescript(SCHEMA)


def create_search(params: dict, zillow_url: str) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO searches (created_at, params_json, zillow_url, status) "
            "VALUES (?, ?, ?, 'running')",
            (datetime.now(timezone.utc).isoformat(), json.dumps(params), zillow_url),
        )
        return cur.lastrowid


def set_search_status(search_id: int, status: str, error: str | None = None):
    with get_conn() as conn:
        conn.execute(
            "UPDATE searches SET status = ?, error = ? WHERE id = ?",
            (status, error, search_id),
        )


def get_search(search_id: int) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM searches WHERE id = ?", (search_id,)).fetchone()
        return dict(row) if row else None


def add_property(search_id: int, data: dict, sort_order: int) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO properties
               (search_id, zpid, address, city, state, zipcode, price, beds, baths,
                sqft, lot_size, year_built, home_type, status_text, description,
                agent_name, agent_phone, listing_url, latitude, longitude, sort_order)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                search_id,
                data.get("zpid"),
                data.get("address"),
                data.get("city"),
                data.get("state"),
                data.get("zipcode"),
                data.get("price"),
                data.get("beds"),
                data.get("baths"),
                data.get("sqft"),
                data.get("lot_size"),
                data.get("year_built"),
                data.get("home_type"),
                data.get("status_text"),
                data.get("description"),
                data.get("agent_name"),
                data.get("agent_phone"),
                data.get("listing_url"),
                data.get("latitude"),
                data.get("longitude"),
                sort_order,
            ),
        )
        return cur.lastrowid


def add_photo(property_id: int, source_url: str, local_path: str | None,
              caption: str | None, category: str, sort_order: int) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO photos (property_id, source_url, local_path, caption, category, sort_order)
               VALUES (?,?,?,?,?,?)""",
            (property_id, source_url, local_path, caption, category, sort_order),
        )
        return cur.lastrowid


def list_properties(search_id: int) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM properties WHERE search_id = ? ORDER BY sort_order",
            (search_id,),
        ).fetchall()
        properties = [dict(r) for r in rows]
        for prop in properties:
            photo_rows = conn.execute(
                "SELECT * FROM photos WHERE property_id = ? ORDER BY sort_order",
                (prop["id"],),
            ).fetchall()
            prop["photos"] = [dict(p) for p in photo_rows]
        return properties


def set_property_selected(property_id: int, selected: bool):
    with get_conn() as conn:
        conn.execute(
            "UPDATE properties SET selected = ? WHERE id = ?",
            (1 if selected else 0, property_id),
        )


def get_selected_properties(search_id: int) -> list[dict]:
    all_props = list_properties(search_id)
    return [p for p in all_props if p["selected"]]
