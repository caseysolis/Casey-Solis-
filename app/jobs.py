"""Background search-job orchestration: scrape -> classify -> download -> store."""
import threading
from pathlib import Path

import config
from processing.photo_classifier import classify_photos
from scraper.zillow_scraper import download_photo, scrape_search
from storage import db

# search_id -> latest human-readable progress message. In-memory only;
# fine for a single-user local app that doesn't need to survive restarts.
PROGRESS: dict[int, str] = {}


def start_search_job(search_id: int, zillow_url: str, max_results: int):
    thread = threading.Thread(
        target=_run_search_job, args=(search_id, zillow_url, max_results), daemon=True
    )
    thread.start()


def _run_search_job(search_id: int, zillow_url: str, max_results: int):
    def progress(msg: str):
        PROGRESS[search_id] = msg

    try:
        progress("Starting...")
        scraped = scrape_search(zillow_url, max_results, progress_cb=progress)

        for sort_order, prop in enumerate(scraped):
            property_id = db.add_property(search_id, prop.__dict__, sort_order)

            classified = classify_photos(prop.photos)
            for photo in classified:
                local_path = None
                if photo.get("url"):
                    dest = (
                        config.PHOTOS_DIR
                        / str(search_id)
                        / str(property_id)
                        / f"{photo['sort_order']:02d}.jpg"
                    )
                    if download_photo(photo["url"], dest):
                        local_path = str(dest)
                db.add_photo(
                    property_id=property_id,
                    source_url=photo.get("url"),
                    local_path=local_path,
                    caption=photo.get("caption"),
                    category=photo.get("category"),
                    sort_order=photo.get("sort_order", 0),
                )

        progress(f"Done: {len(scraped)} propert{'y' if len(scraped) == 1 else 'ies'} found.")
        db.set_search_status(search_id, "done")
    except Exception as exc:
        progress(f"Failed: {exc}")
        db.set_search_status(search_id, "error", error=str(exc))
