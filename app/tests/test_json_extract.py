from scraper.json_extract import (
    best_photo_list,
    extract_json_blobs,
    find_first_key,
    find_photo_arrays,
    normalize_photo_entry,
)

FAKE_ZILLOW_PAGE = """
<html><head></head><body>
<script id="__NEXT_DATA__" type="application/json">
{"props": {"pageProps": {"componentProps": {"gdpClientCache": {"property": {
    "zpid": "123456",
    "streetAddress": "123 Main St",
    "city": "Springfield",
    "state": "IL",
    "zipcode": "62704",
    "price": 425000,
    "bedrooms": 4,
    "bathrooms": 2.5,
    "livingArea": 2200,
    "yearBuilt": 1998,
    "homeType": "SINGLE_FAMILY",
    "description": "A lovely home.",
    "photos": [
        {"url": "https://example.com/1.jpg", "caption": "Front of home"},
        {"url": "https://example.com/2.jpg", "caption": "Kitchen"}
    ]
}}}}}}
</script>
</body></html>
"""


def test_extract_json_blobs_parses_next_data():
    blobs = extract_json_blobs(FAKE_ZILLOW_PAGE)
    assert len(blobs) >= 1


def test_find_first_key_recursively_locates_field():
    blobs = extract_json_blobs(FAKE_ZILLOW_PAGE)
    address = find_first_key(blobs[0], ["streetAddress", "address"])
    assert address == "123 Main St"
    price = find_first_key(blobs[0], ["price"])
    assert price == 425000


def test_find_first_key_returns_none_when_absent():
    assert find_first_key({"a": {"b": 1}}, ["nonexistent"]) is None


def test_find_photo_arrays_and_best_photo_list():
    blobs = extract_json_blobs(FAKE_ZILLOW_PAGE)
    arrays = find_photo_arrays(blobs[0])
    assert len(arrays) >= 1
    best = best_photo_list(blobs[0])
    assert len(best) == 2
    assert best[0]["caption"] == "Front of home"


def test_normalize_photo_entry_prefers_direct_url():
    entry = {"url": "https://example.com/a.jpg", "caption": "Living room"}
    normalized = normalize_photo_entry(entry)
    assert normalized == {"url": "https://example.com/a.jpg", "caption": "Living room"}


def test_normalize_photo_entry_picks_highest_res_mixed_source():
    entry = {
        "mixedSources": {
            "jpeg": [
                {"url": "https://example.com/small.jpg", "width": 400},
                {"url": "https://example.com/big.jpg", "width": 1600},
            ]
        }
    }
    normalized = normalize_photo_entry(entry)
    assert normalized["url"] == "https://example.com/big.jpg"


def test_normalize_photo_entry_returns_none_without_url():
    assert normalize_photo_entry({"caption": "no url here"}) is None
