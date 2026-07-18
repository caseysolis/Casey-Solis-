"""Renders selected properties into a single clean combined PDF report.

Report HTML is built with Jinja2, then converted to PDF using the same
Chromium/Playwright already required for scraping -- so there's no extra
system dependency (e.g. WeasyPrint's native libraries) to install.
"""
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from playwright.sync_api import sync_playwright

import config
from processing.photo_classifier import CATEGORY_ORDER

TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"


def _round_num(value):
    if value is None:
        return ""
    return int(value) if float(value) == int(value) else value


def _photo_uri(local_path: str | None, source_url: str | None) -> str | None:
    if local_path and Path(local_path).exists():
        return Path(local_path).resolve().as_uri()
    return source_url  # last resort: hit the network for the original URL


def _prepare_property(prop: dict) -> dict:
    prop = dict(prop)
    photos = prop.get("photos") or []

    hero_uri = None
    grouped: dict[str, list] = {}
    for i, photo in enumerate(photos):
        uri = _photo_uri(photo.get("local_path"), photo.get("source_url"))
        if not uri:
            continue
        if i == 0 and photo.get("category") == "Front Exterior":
            hero_uri = uri
            continue
        category = photo.get("category") or "Other / Additional Photos"
        grouped.setdefault(category, []).append({"uri": uri, "caption": photo.get("caption")})

    # If nothing qualified as the hero shot (e.g. no photos were classified
    # as front exterior), just use the very first available photo.
    if hero_uri is None and photos:
        first = photos[0]
        hero_uri = _photo_uri(first.get("local_path"), first.get("source_url"))
        category = first.get("category") or "Other / Additional Photos"
        if grouped.get(category) and grouped[category] and grouped[category][0]["uri"] == hero_uri:
            grouped[category].pop(0)
            if not grouped[category]:
                del grouped[category]

    ordered_groups = [(cat, grouped[cat]) for cat in CATEGORY_ORDER if cat in grouped]

    prop["hero_photo_uri"] = hero_uri
    prop["photos_by_category"] = ordered_groups
    return prop


def build_report_html(properties: list[dict], search_summary: str, report_title: str = "Home Search Report") -> str:
    env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))
    env.filters["round_num"] = _round_num
    template = env.get_template("report.html.j2")

    prepared = [_prepare_property(p) for p in properties]

    return template.render(
        report_title=report_title,
        generated_at=datetime.now().strftime("%B %d, %Y at %I:%M %p"),
        search_summary=search_summary,
        properties=prepared,
    )


def render_pdf(html: str, output_path: Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.set_content(html, wait_until="load")
            page.pdf(
                path=str(output_path),
                format="Letter",
                print_background=True,
                display_header_footer=True,
                header_template='<div style="font-size:8px; width:100%; text-align:center; color:#9aa5b1;"></div>',
                footer_template=(
                    '<div style="font-size:8px; width:100%; text-align:center; color:#9aa5b1;">'
                    'Page <span class="pageNumber"></span> of <span class="totalPages"></span>'
                    "</div>"
                ),
                margin={"top": "0.6in", "bottom": "0.7in", "left": "0.55in", "right": "0.55in"},
            )
        finally:
            browser.close()


def build_and_render(properties: list[dict], search_summary: str, output_path: Path, report_title: str = "Home Search Report"):
    html = build_report_html(properties, search_summary, report_title)
    render_pdf(html, output_path)
    return output_path
