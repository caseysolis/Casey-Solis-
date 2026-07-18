import importlib
import sys

import pytest


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Boot the Flask app against a throwaway data directory so tests don't
    touch the real app/data/ (and each test starts from a clean DB)."""
    monkeypatch.setenv("HOME", str(tmp_path))

    import config as config_module

    monkeypatch.setattr(config_module, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(config_module, "PHOTOS_DIR", tmp_path / "data" / "photos")
    monkeypatch.setattr(config_module, "REPORTS_DIR", tmp_path / "data" / "reports")
    monkeypatch.setattr(config_module, "DB_PATH", tmp_path / "data" / "app.db")
    for d in (config_module.DATA_DIR, config_module.PHOTOS_DIR, config_module.REPORTS_DIR):
        d.mkdir(parents=True, exist_ok=True)

    for mod_name in ("storage.db", "app"):
        if mod_name in sys.modules:
            del sys.modules[mod_name]
    import storage.db as db_module
    app_module = importlib.import_module("app")

    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as c:
        yield c, db_module


def _seed_search_with_property(db_module, location: str, address: str, price: str, selected: bool = True):
    search_id = db_module.create_search({"location": location}, f"https://www.zillow.com/homes/for_sale/{location}_rb/")
    property_id = db_module.add_property(
        search_id,
        {"address": address, "city": location, "price": price, "listing_url": "https://www.zillow.com/homedetails/x/1_zpid/"},
        sort_order=0,
    )
    db_module.set_property_selected(property_id, selected)
    db_module.set_search_status(search_id, "done")
    return search_id, property_id


def test_index_serves_frontend(client):
    c, _ = client
    resp = c.get("/")
    assert resp.status_code == 200


def test_search_requires_url_or_location(client):
    c, _ = client
    resp = c.post("/api/search", json={})
    assert resp.status_code == 400


def test_combined_report_across_two_searches(client):
    c, db_module = client
    search_a, _ = _seed_search_with_property(db_module, "North Andover, MA", "1 Elm St", "$800,000")
    search_b, _ = _seed_search_with_property(db_module, "Andover, MA", "2 Oak St", "$850,000")

    resp = c.post("/api/report", json={"search_ids": [search_a, search_b]})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["filename"].startswith(f"home_search_report_{search_a}-{search_b}_")

    dl = c.get(data["download_url"])
    assert dl.status_code == 200
    assert dl.data[:5] == b"%PDF-"


def test_combined_report_summary_lists_both_locations(client, monkeypatch):
    c, db_module = client
    search_a, _ = _seed_search_with_property(db_module, "North Andover, MA", "1 Elm St", "$800,000")
    search_b, _ = _seed_search_with_property(db_module, "Andover, MA", "2 Oak St", "$850,000")

    captured = {}
    import reporting.report_builder as rb

    original = rb.build_and_render

    def spy(properties, search_summary, output_path, **kwargs):
        captured["summary"] = search_summary
        captured["count"] = len(properties)
        return original(properties, search_summary, output_path, **kwargs)

    monkeypatch.setattr(rb, "build_and_render", spy)
    import app as app_module
    monkeypatch.setattr(app_module, "build_and_render", spy)

    resp = c.post("/api/report", json={"search_ids": [search_a, search_b]})
    assert resp.status_code == 200
    assert captured["summary"] == "North Andover, MA + Andover, MA"
    assert captured["count"] == 2


def test_combined_report_errors_when_nothing_selected(client):
    c, db_module = client
    search_a, prop_id = _seed_search_with_property(db_module, "North Andover, MA", "1 Elm St", "$800,000", selected=False)

    resp = c.post("/api/report", json={"search_ids": [search_a]})
    assert resp.status_code == 400


def test_searches_properties_combines_multiple_search_ids(client):
    c, db_module = client
    search_a, _ = _seed_search_with_property(db_module, "North Andover, MA", "1 Elm St", "$800,000")
    search_b, _ = _seed_search_with_property(db_module, "Andover, MA", "2 Oak St", "$850,000")

    resp = c.get(f"/api/searches/properties?ids={search_a},{search_b}")
    assert resp.status_code == 200
    addresses = {p["address"] for p in resp.get_json()["properties"]}
    assert addresses == {"1 Elm St", "2 Oak St"}
