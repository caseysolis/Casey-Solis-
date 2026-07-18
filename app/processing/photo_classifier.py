"""Sorts a property's photos into a front-to-back, outside-to-inside order.

Zillow listing photos are not reliably tagged with a machine-readable room
type. When a caption is present (many listings do have one, e.g. "Kitchen",
"Front of home", "Back yard") we match it against keyword lists. When no
caption is available we fall back to Zillow's own photo ordering convention,
which almost always puts the front exterior shot first.

The output ordering is: front exterior -> other exterior/yard -> living
areas -> kitchen -> dining -> bedrooms -> bathrooms -> garage/basement/utility
-> everything else, in that order, preserving original relative order within
each category.
"""

CATEGORY_ORDER = [
    "Front Exterior",
    "Exterior / Yard",
    "Living Areas",
    "Kitchen",
    "Dining Room",
    "Bedrooms",
    "Bathrooms",
    "Garage / Basement / Utility",
    "Other / Additional Photos",
]

_KEYWORDS = {
    "Front Exterior": [
        "front of", "front exterior", "front view", "curb appeal", "facade",
        "entrance", "entry way", "entryway", "street view", "welcome",
    ],
    "Exterior / Yard": [
        "exterior", "back of", "back yard", "backyard", "rear", "yard",
        "patio", "deck", "pool", "porch", "aerial", "drone", "garden",
        "landscap", "outdoor", "balcony", "courtyard", "driveway", "roof",
    ],
    "Living Areas": [
        "living room", "family room", "great room", "den", "lounge",
        "sitting room", "sunroom", "loft",
    ],
    "Kitchen": ["kitchen", "pantry", "breakfast nook"],
    "Dining Room": ["dining"],
    "Bedrooms": ["bedroom", "primary suite", "master bedroom", "guest room", "nursery"],
    "Bathrooms": ["bathroom", "bath", "powder room", "ensuite", "en-suite"],
    "Garage / Basement / Utility": [
        "garage", "basement", "laundry", "utility", "mechanical", "attic",
        "storage", "workshop", "mudroom", "mud room",
    ],
}


def classify_caption(caption: str) -> str | None:
    """Return a category name if the caption matches known keywords, else None."""
    if not caption:
        return None
    text = caption.strip().lower()
    if not text:
        return None
    for category in CATEGORY_ORDER[:-1]:  # "Other" has no keywords, it's the fallback
        for kw in _KEYWORDS.get(category, []):
            if kw in text:
                return category
    return None


def classify_photos(photos: list[dict]) -> list[dict]:
    """Given a list of {"url"/"source_url", "caption"} dicts (in original
    Zillow order), return them annotated with "category" and sorted into
    front-to-back / outside-to-inside order.

    Input photos are not mutated; a new list of shallow copies is returned.
    """
    annotated = []
    for idx, photo in enumerate(photos):
        photo = dict(photo)
        category = classify_caption(photo.get("caption"))
        if category is None:
            # No usable caption: fall back to Zillow's own ordering
            # convention -- the very first photo is virtually always the
            # front exterior "cover" shot.
            category = "Front Exterior" if idx == 0 else "Other / Additional Photos"
        photo["category"] = category
        photo["_original_index"] = idx
        annotated.append(photo)

    category_rank = {name: i for i, name in enumerate(CATEGORY_ORDER)}
    annotated.sort(key=lambda p: (category_rank.get(p["category"], len(CATEGORY_ORDER)), p["_original_index"]))

    for sort_order, photo in enumerate(annotated):
        photo["sort_order"] = sort_order
        del photo["_original_index"]

    return annotated
