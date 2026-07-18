"""Generic helpers for pulling data out of Zillow's embedded JSON blobs.

Zillow renders with Next.js and ships most of the page's data as a big
JSON object inside a <script id="__NEXT_DATA__"> tag (or similar). The
*exact* nesting of that object changes across redesigns, but the field
names themselves (e.g. "streetAddress", "bedrooms", "photos") tend to be
far more stable. Rather than hard-coding a brittle path like
data["props"]["pageProps"]["x"]["y"], we recursively search the parsed
JSON for keys/shapes we recognize. This is slower but survives minor
restructuring much better than a fixed path would.
"""
import json
import re
from typing import Any

_NEXT_DATA_RE = re.compile(
    r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.DOTALL
)

# Some Zillow page variants embed a similarly-shaped blob under a different
# script id/attribute; keep a couple of fallback patterns.
_FALLBACK_JSON_RES = [
    re.compile(r'<script[^>]+id="hdpApolloCache"[^>]*>(.*?)</script>', re.DOTALL),
    re.compile(r'"gdpClientCache"\s*:\s*"(.*?)"\s*[,}]', re.DOTALL),
]


def extract_json_blobs(html: str) -> list[Any]:
    """Return every parseable JSON object embedded in the page."""
    blobs = []
    for pattern in [_NEXT_DATA_RE] + _FALLBACK_JSON_RES:
        for match in pattern.finditer(html):
            raw = match.group(1)
            for candidate in (raw, _unescape(raw)):
                try:
                    blobs.append(json.loads(candidate))
                    break
                except (json.JSONDecodeError, TypeError):
                    continue
    return blobs


def _unescape(s: str) -> str:
    return s.encode("utf-8").decode("unicode_escape") if "\\" in s else s


def find_first_key(obj: Any, key_names: list[str], _depth: int = 0) -> Any:
    """Depth-first search for the first occurrence of any of key_names."""
    if _depth > 40:
        return None
    if isinstance(obj, dict):
        for k in key_names:
            if k in obj and obj[k] not in (None, "", []):
                return obj[k]
        for v in obj.values():
            found = find_first_key(v, key_names, _depth + 1)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = find_first_key(item, key_names, _depth + 1)
            if found is not None:
                return found
    return None


def find_photo_arrays(obj: Any, _depth: int = 0, _seen: set | None = None) -> list[list[dict]]:
    """Find all lists-of-dicts in obj that look like photo collections.

    A candidate list item must be a dict containing a url-ish key
    ("url", "highResUrl", "mixedSources") so we don't accidentally match
    unrelated arrays.
    """
    if _seen is None:
        _seen = set()
    results = []
    if _depth > 40:
        return results
    if isinstance(obj, dict):
        obj_id = id(obj)
        if obj_id in _seen:
            return results
        _seen.add(obj_id)
        for v in obj.values():
            results.extend(find_photo_arrays(v, _depth + 1, _seen))
    elif isinstance(obj, list):
        if obj and all(isinstance(i, dict) for i in obj):
            url_keys = {"url", "highResUrl", "mixedSources", "src"}
            if any(url_keys & set(item.keys()) for item in obj):
                results.append(obj)
        for item in obj:
            results.extend(find_photo_arrays(item, _depth + 1, _seen))
    return results


def best_photo_list(obj: Any) -> list[dict]:
    """Pick the largest photo-like array found anywhere in the JSON tree."""
    candidates = find_photo_arrays(obj)
    if not candidates:
        return []
    return max(candidates, key=len)


def normalize_photo_entry(entry: dict) -> dict | None:
    """Turn a raw Zillow photo JSON entry into {"url": ..., "caption": ...}."""
    url = entry.get("url") or entry.get("highResUrl") or entry.get("src")
    if not url and isinstance(entry.get("mixedSources"), dict):
        sources = entry["mixedSources"]
        for fmt in ("jpeg", "webp"):
            variants = sources.get(fmt) or []
            if variants:
                # Prefer the highest-resolution variant available.
                url = max(variants, key=lambda v: v.get("width", 0)).get("url")
                if url:
                    break
    if not url:
        return None
    caption = entry.get("caption") or entry.get("description") or ""
    return {"url": url, "caption": caption}
