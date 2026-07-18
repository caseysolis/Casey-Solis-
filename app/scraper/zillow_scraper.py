"""Playwright-based Zillow scraper.

Usage note (read before running at scale): Zillow's Terms of Service
prohibit automated scraping, and they run bot detection (PerimeterX) that
can block or CAPTCHA automated browsers. This module is meant for the
occasional, personal use case of "pull details for the dozen listings I'm
personally considering" -- not for bulk/commercial data collection. It:
  - runs a single browser session per search (no parallel hammering),
  - waits a polite, randomized delay between page loads,
  - is capped at MAX_RESULTS_HARD_CAP listings per search.
It deliberately does NOT do anything to defeat bot detection (no proxy
rotation, no fingerprint spoofing, no CAPTCHA solving). If Zillow blocks a
run, the fix is to slow down / run less often / do it from your own home
connection -- not to route around the block.

Because Zillow frequently changes its markup, this scraper leans on two
resilience strategies rather than fixed CSS selectors:
  1. Regex over the raw HTML for the one URL pattern that's stayed stable
     for years: /homedetails/<slug>/<zpid>_zpid/
  2. Generic recursive search over Zillow's embedded JSON (see
     json_extract.py) for recognizable field names, instead of a fixed
     object path.
A best-effort DOM/meta-tag fallback is used for any field JSON search
doesn't find.
"""
import random
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urljoin

import requests
from playwright.sync_api import sync_playwright

import config
from scraper.json_extract import (
    best_photo_list,
    extract_json_blobs,
    find_first_key,
    normalize_photo_entry,
)

ZPID_URL_RE = re.compile(r'(/homedetails/[^"\'<>\s]+?/(\d+)_zpid/)')


@dataclass
class ScrapedProperty:
    zpid: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    zipcode: str | None = None
    price: str | None = None
    beds: float | None = None
    baths: float | None = None
    sqft: int | None = None
    lot_size: str | None = None
    year_built: int | None = None
    home_type: str | None = None
    status_text: str | None = None
    description: str | None = None
    agent_name: str | None = None
    agent_phone: str | None = None
    listing_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    photos: list[dict] = field(default_factory=list)


def build_basic_search_url(location: str, status: str = "for_sale") -> str:
    """Build a simple location-only Zillow search URL.

    For anything beyond a plain location search (price range, beds/baths,
    home type, etc.) it's far more reliable to set those filters yourself
    on zillow.com and paste the resulting URL, rather than have this tool
    guess at Zillow's filter-encoding scheme.
    """
    slug = location.strip().replace(",", "").replace(" ", "-")
    return f"https://www.zillow.com/homes/{status}/{slug}_rb/"


def _polite_wait():
    time.sleep(random.uniform(config.MIN_REQUEST_DELAY, config.MAX_REQUEST_DELAY))


def _extract_detail_urls(html: str, base_url: str) -> list[str]:
    urls = []
    seen_zpids = set()
    for full_match, zpid in ZPID_URL_RE.findall(html):
        if zpid in seen_zpids:
            continue
        seen_zpids.add(zpid)
        urls.append(urljoin(base_url, full_match))
    return urls


def _safe(fn, default=None):
    try:
        result = fn()
        return result if result not in (None, "") else default
    except Exception:
        return default


def _parse_detail_page(html: str, listing_url: str) -> ScrapedProperty:
    prop = ScrapedProperty(listing_url=listing_url)
    blobs = extract_json_blobs(html)

    def find(*keys):
        for blob in blobs:
            val = find_first_key(blob, list(keys))
            if val is not None:
                return val
        return None

    prop.zpid = _safe(lambda: str(find("zpid")))
    prop.address = _safe(lambda: find("streetAddress", "address"))
    prop.city = _safe(lambda: find("city"))
    prop.state = _safe(lambda: find("state"))
    prop.zipcode = _safe(lambda: str(find("zipcode", "zip")))
    price_val = _safe(lambda: find("price", "unformattedPrice"))
    prop.price = _safe(lambda: f"${int(price_val):,}") if isinstance(price_val, (int, float)) else _safe(lambda: str(price_val))
    prop.beds = _safe(lambda: float(find("bedrooms")))
    prop.baths = _safe(lambda: float(find("bathrooms")))
    sqft_val = _safe(lambda: find("livingArea", "livingAreaValue"))
    prop.sqft = _safe(lambda: int(float(sqft_val))) if sqft_val else None
    prop.lot_size = _safe(lambda: str(find("lotSize", "lotAreaString")))
    year_val = _safe(lambda: find("yearBuilt"))
    prop.year_built = _safe(lambda: int(year_val)) if year_val else None
    prop.home_type = _safe(lambda: find("homeType"))
    prop.status_text = _safe(lambda: find("homeStatus", "statusText"))
    prop.description = _safe(lambda: find("description", "homeDescription"))
    prop.agent_name = _safe(lambda: find("agentName", "listingAgentName"))
    prop.agent_phone = _safe(lambda: find("agentPhoneNumber", "phoneNumber"))
    prop.latitude = _safe(lambda: float(find("latitude")))
    prop.longitude = _safe(lambda: float(find("longitude")))

    photos_raw = []
    for blob in blobs:
        photos_raw = best_photo_list(blob)
        if photos_raw:
            break
    photos = []
    for entry in photos_raw:
        normalized = normalize_photo_entry(entry)
        if normalized:
            photos.append(normalized)
    prop.photos = photos

    # DOM / meta-tag fallback for anything JSON search came up empty on.
    if not prop.address or not prop.price:
        og_title_match = re.search(r'<meta property="og:title" content="([^"]+)"', html)
        if og_title_match and not prop.address:
            prop.address = og_title_match.group(1).split(",")[0].strip()
    if not prop.photos:
        og_image_matches = re.findall(r'<meta property="og:image" content="([^"]+)"', html)
        prop.photos = [{"url": u, "caption": ""} for u in og_image_matches]

    return prop


def scrape_search(zillow_url: str, max_results: int, progress_cb=None) -> list[ScrapedProperty]:
    """Run a search against a Zillow search-results URL and return detailed
    property data for up to max_results listings found on the first page
    of results.

    progress_cb, if given, is called with a short status string after each
    step so a caller (e.g. a Flask background thread) can surface progress.
    """
    max_results = min(max_results, config.MAX_RESULTS_HARD_CAP)
    results: list[ScrapedProperty] = []

    def report(msg):
        if progress_cb:
            progress_cb(msg)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=config.HEADLESS)
        context = browser.new_context(
            user_agent=config.USER_AGENT,
            viewport={"width": 1366, "height": 900},
        )
        page = context.new_page()
        try:
            report(f"Loading search results page...")
            page.goto(zillow_url, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(2500)
            html = page.content()
            detail_urls = _extract_detail_urls(html, zillow_url)[:max_results]
            report(f"Found {len(detail_urls)} listing(s), fetching details...")

            for i, url in enumerate(detail_urls, start=1):
                report(f"Fetching listing {i} of {len(detail_urls)}...")
                _polite_wait()
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=45000)
                    page.wait_for_timeout(1500)
                    detail_html = page.content()
                    prop = _parse_detail_page(detail_html, url)
                    results.append(prop)
                except Exception as exc:
                    report(f"Skipped a listing after an error: {exc}")
                    continue
        finally:
            browser.close()

    return results


def download_photo(url: str, dest_path: Path) -> bool:
    try:
        resp = requests.get(url, headers={"User-Agent": config.USER_AGENT}, timeout=20, stream=True)
        resp.raise_for_status()
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception:
        return False
