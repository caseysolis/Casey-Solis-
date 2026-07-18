# Home Search Reports

A personal web app for house-hunting: give it a Zillow search (a location,
or a full Zillow search URL with your own filters already applied), and it
will fetch the listings it finds, download their photos, sort each
property's photos front-to-back / outside-to-inside (front exterior → yard
→ living areas → kitchen → bedrooms → bathrooms → garage/basement → other),
and generate one clean combined PDF report you can browse, print, or take
with you to showings.

It's built to run on your own computer, not a server — see "Important
notes on Zillow" below for why.

## What it does

1. **Search** — paste a Zillow search-results URL (recommended, since you
   set the price/beds/baths/home-type filters yourself on zillow.com) or
   just type a location for a quick unfiltered search.
2. **Scrape** — a real Chromium browser (via Playwright) visits the search
   results and then each individual listing, pulling address, price,
   beds/baths/sqft, description, agent info, and every listing photo.
3. **Organize** — photos are sorted using their captions when Zillow
   provides one (e.g. "Front of home", "Kitchen", "Back yard"), falling
   back to Zillow's own photo ordering (front exterior is virtually always
   photo #1) when no caption is available.
4. **Review** — a results grid lets you uncheck any properties you don't
   want in the report. Searching multiple towns? Run a search for each —
   every search you add stacks into the same results grid, so you review
   and report on all of them together.
5. **Report** — generates a single polished PDF: a cover page with a
   clickable index, then one section per property with a hero exterior
   photo, key stats, categorized photo grids, description, and details.

## Searching by criteria Zillow doesn't have a checkbox for

Some things people search for — an in-law suite, a specific year-built
range — don't have a dedicated Zillow filter checkbox. Two ways to handle
that:

- **Keyword filter**: on zillow.com, open the "More" filters panel and use
  the **Keywords** box to match listing description text, e.g. `in-law
  suite, in-law apartment, accessory apartment, guest suite`. Combine with
  the Home Type / Year Built / Price filters on the same panel, then paste
  the resulting URL into this app.
- **Year Built range**: also under "More" filters on zillow.com — e.g. to
  find newer construction, set the minimum to a few years back.
- **Multiple towns**: either run one search per town in this app (they'll
  combine into one report — see above), or draw a single custom boundary
  covering multiple towns using Zillow's map draw-boundary tool and paste
  that one URL instead.

## Important notes on Zillow

- **Terms of Service**: Zillow's ToS prohibit automated scraping of their
  site. This tool is meant for light, personal use — searching for the
  handful of homes you're personally considering — not for bulk or
  repeated commercial data collection. Please keep it that way.
- **Bot detection**: Zillow runs bot-detection (PerimeterX) that can block
  or CAPTCHA automated browsers, especially from datacenter/cloud IPs.
  This is why the app is designed to run on your own computer, from your
  own home connection, rather than be deployed to a server. It also runs
  headed (a visible browser window) by default, and waits a few seconds
  between page loads — both make it look more like a normal person
  browsing and less like a bot. It does **not** do anything to defeat bot
  detection (no proxy rotation, no fingerprint spoofing, no CAPTCHA
  solving) — if Zillow blocks a run, slow down or try again later rather
  than trying to route around it.
- **Fragility**: Zillow changes its site's markup periodically. The
  scraper is written defensively (it searches Zillow's embedded JSON data
  for recognizable field names rather than relying on exact CSS selectors,
  and falls back to page meta tags if that fails), but if Zillow ships a
  bigger redesign, some fields may come back empty until the scraper is
  updated.

## Setup

Requires Python 3.10+.

```bash
cd app
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium      # downloads a matching Chromium build
```

## Running it

```bash
source .venv/bin/activate
python app.py
```

Then open **http://localhost:5050** in your browser.

- Data (downloaded photos, the local SQLite database, and generated PDFs)
  is stored under `app/data/`, which is git-ignored.
- Generated PDF reports are saved under `app/data/reports/` and also
  downloadable straight from the browser when a report finishes.

## Configuration

Environment variables (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `HEADLESS` | `false` | Set to `true` to run the browser without a visible window. Headed is recommended (see "bot detection" above). |
| `MIN_REQUEST_DELAY` / `MAX_REQUEST_DELAY` | `2.0` / `4.5` | Random delay range (seconds) between page loads. |
| `MAX_RESULTS_HARD_CAP` | `60` | Hard ceiling on listings fetched in a single search, regardless of what's requested. |

## Project layout

```
app/
  app.py                    Flask routes
  jobs.py                   Background search-job orchestration
  config.py                 Paths & scraping settings
  scraper/
    zillow_scraper.py       Playwright-based search + listing scraper
    json_extract.py         Resilient recursive JSON field/photo extraction
  processing/
    photo_classifier.py     Front-to-back / outside-to-inside photo sorting
  reporting/
    report_builder.py       Renders the combined PDF (via Chromium print-to-PDF)
    templates/report.html.j2
  storage/
    db.py                   SQLite persistence
  static/                   Frontend (plain HTML/CSS/JS)
  tests/                    Unit tests (no live Zillow requests)
```

## Running the tests

```bash
source .venv/bin/activate
pytest
```

Tests cover the photo classifier, the resilient JSON extraction helpers,
URL building/parsing, and full PDF report generation — using fixture data,
so they don't hit zillow.com.
