import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
PHOTOS_DIR = DATA_DIR / "photos"
REPORTS_DIR = DATA_DIR / "reports"
DB_PATH = DATA_DIR / "app.db"

for d in (DATA_DIR, PHOTOS_DIR, REPORTS_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Run the scraper with a visible browser window instead of headless.
# A real, visible browser window (from your own home connection) is
# noticeably less likely to get flagged by Zillow's bot detection than a
# headless one. Default to headed for that reason; set HEADLESS=true to
# override.
HEADLESS = os.environ.get("HEADLESS", "false").strip().lower() == "true"

# Be polite: minimum delay (seconds) between page requests to Zillow.
MIN_REQUEST_DELAY = float(os.environ.get("MIN_REQUEST_DELAY", "2.0"))
MAX_REQUEST_DELAY = float(os.environ.get("MAX_REQUEST_DELAY", "4.5"))

# Hard cap on how many listings a single search will fetch, so a mistyped
# search can't turn into an all-night scrape of Zillow.
MAX_RESULTS_HARD_CAP = int(os.environ.get("MAX_RESULTS_HARD_CAP", "60"))

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
