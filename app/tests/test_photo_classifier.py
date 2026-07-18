from processing.photo_classifier import CATEGORY_ORDER, classify_caption, classify_photos


def test_classify_caption_matches_known_keywords():
    assert classify_caption("Front of home") == "Front Exterior"
    assert classify_caption("Back yard with pool") == "Exterior / Yard"
    assert classify_caption("Gourmet Kitchen") == "Kitchen"
    assert classify_caption("Primary Bedroom") == "Bedrooms"
    assert classify_caption("Full Bathroom") == "Bathrooms"
    assert classify_caption("2-car Garage") == "Garage / Basement / Utility"
    assert classify_caption("") is None
    assert classify_caption(None) is None
    assert classify_caption("Random room shot") is None


def test_classify_photos_orders_front_to_back_outside_to_inside():
    photos = [
        {"url": "u1", "caption": "Kitchen"},
        {"url": "u2", "caption": "Front of home"},
        {"url": "u3", "caption": "Primary bedroom"},
        {"url": "u4", "caption": "Back yard"},
        {"url": "u5", "caption": "Full bathroom"},
    ]
    result = classify_photos(photos)
    categories_in_order = [p["category"] for p in result]

    # Front exterior must lead, and each category group must appear in
    # CATEGORY_ORDER order overall.
    assert categories_in_order[0] == "Front Exterior"
    seen_ranks = [CATEGORY_ORDER.index(c) for c in categories_in_order]
    assert seen_ranks == sorted(seen_ranks)


def test_classify_photos_falls_back_to_first_photo_as_front_exterior():
    photos = [
        {"url": "cover.jpg", "caption": ""},
        {"url": "other.jpg", "caption": ""},
        {"url": "another.jpg", "caption": None},
    ]
    result = classify_photos(photos)
    assert result[0]["url"] == "cover.jpg"
    assert result[0]["category"] == "Front Exterior"
    for p in result[1:]:
        assert p["category"] == "Other / Additional Photos"


def test_classify_photos_preserves_original_order_within_category():
    photos = [
        {"url": "front.jpg", "caption": "front exterior"},
        {"url": "k1.jpg", "caption": "kitchen"},
        {"url": "k2.jpg", "caption": "kitchen nook"},
    ]
    result = classify_photos(photos)
    kitchen_photos = [p["url"] for p in result if p["category"] == "Kitchen"]
    assert kitchen_photos == ["k1.jpg", "k2.jpg"]


def test_classify_photos_does_not_mutate_input():
    photos = [{"url": "a.jpg", "caption": "front of home"}]
    classify_photos(photos)
    assert "category" not in photos[0]
