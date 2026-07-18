import base64
from pathlib import Path

from reporting.report_builder import _prepare_property, build_and_render, build_report_html

# A minimal valid 1x1 red-pixel JPEG, used so the rendered report has a
# real (if tiny) image to embed instead of a broken-image icon.
_TINY_JPEG_B64 = (
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkI"
    "CQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAA"
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=="
)


def _write_tiny_jpeg(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(base64.b64decode(_TINY_JPEG_B64))


def _sample_properties(tmp_path: Path) -> list[dict]:
    photo_dir = tmp_path / "photos"
    photos_a = [
        {"local_path": None, "source_url": None, "caption": "Front of home", "category": "Front Exterior"},
        {"local_path": None, "source_url": None, "caption": "Kitchen", "category": "Kitchen"},
        {"local_path": None, "source_url": None, "caption": "Back yard", "category": "Exterior / Yard"},
    ]
    for i, p in enumerate(photos_a):
        path = photo_dir / "propA" / f"{i}.jpg"
        _write_tiny_jpeg(path)
        p["local_path"] = str(path)

    return [
        {
            "id": 1,
            "address": "123 Main St",
            "city": "Springfield",
            "state": "IL",
            "zipcode": "62704",
            "price": "$425,000",
            "beds": 4,
            "baths": 2.5,
            "sqft": 2200,
            "lot_size": "0.25 acres",
            "year_built": 1998,
            "home_type": "Single Family",
            "status_text": "For Sale",
            "description": "A lovely home with a big yard.",
            "agent_name": "Jane Agent",
            "agent_phone": "555-1234",
            "listing_url": "https://www.zillow.com/homedetails/123-main-st/123456_zpid/",
            "photos": photos_a,
        },
        {
            "id": 2,
            "address": "456 Oak Ave",
            "city": "Springfield",
            "state": "IL",
            "zipcode": "62704",
            "price": "$310,000",
            "beds": 3,
            "baths": 2,
            "sqft": 1500,
            "lot_size": None,
            "year_built": 2005,
            "home_type": "Townhouse",
            "status_text": "For Sale",
            "description": None,
            "agent_name": None,
            "agent_phone": None,
            "listing_url": "https://www.zillow.com/homedetails/456-oak-ave/654321_zpid/",
            "photos": [],
        },
    ]


def test_prepare_property_extracts_hero_and_groups_rest(tmp_path):
    properties = _sample_properties(tmp_path)
    prepared = _prepare_property(properties[0])

    assert prepared["hero_photo_uri"] is not None
    assert prepared["hero_photo_uri"].startswith("file://")

    categories = [cat for cat, _ in prepared["photos_by_category"]]
    # Front exterior photo became the hero, so it should not reappear as a group.
    assert "Front Exterior" not in categories
    assert "Kitchen" in categories
    assert "Exterior / Yard" in categories


def test_prepare_property_handles_no_photos(tmp_path):
    properties = _sample_properties(tmp_path)
    prepared = _prepare_property(properties[1])
    assert prepared["hero_photo_uri"] is None
    assert prepared["photos_by_category"] == []


def test_build_report_html_contains_key_fields(tmp_path):
    properties = _sample_properties(tmp_path)
    html = build_report_html(properties, search_summary="Springfield, IL")
    assert "123 Main St" in html
    assert "$425,000" in html
    assert "456 Oak Ave" in html
    assert "Springfield, IL" in html


def test_build_and_render_produces_valid_pdf(tmp_path):
    properties = _sample_properties(tmp_path)
    output_path = tmp_path / "report.pdf"
    build_and_render(properties, "Springfield, IL", output_path)

    assert output_path.exists()
    data = output_path.read_bytes()
    assert data[:5] == b"%PDF-"
    assert len(data) > 1000
