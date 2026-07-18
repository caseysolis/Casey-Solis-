import json
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory

import config
import jobs
from reporting.report_builder import build_and_render
from scraper.zillow_scraper import build_basic_search_url
from storage import db

app = Flask(__name__, static_folder="static", static_url_path="")
db.init_db()


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/search", methods=["POST"])
def start_search():
    body = request.get_json(force=True) or {}
    zillow_url = (body.get("zillow_url") or "").strip()
    location = (body.get("location") or "").strip()
    max_results = int(body.get("max_results") or 20)
    max_results = max(1, min(max_results, config.MAX_RESULTS_HARD_CAP))

    if not zillow_url and not location:
        return jsonify({"error": "Provide either a Zillow search URL or a location."}), 400

    if not zillow_url:
        zillow_url = build_basic_search_url(location)

    search_id = db.create_search(body, zillow_url)
    jobs.start_search_job(search_id, zillow_url, max_results)

    return jsonify({"search_id": search_id, "zillow_url": zillow_url})


@app.route("/api/search/<int:search_id>/status")
def search_status(search_id):
    search = db.get_search(search_id)
    if not search:
        return jsonify({"error": "not found"}), 404
    return jsonify(
        {
            "status": search["status"],
            "error": search["error"],
            "progress": jobs.PROGRESS.get(search_id, ""),
        }
    )


def _with_display_urls(properties):
    for prop in properties:
        for photo in prop["photos"]:
            if photo.get("local_path"):
                rel = Path(photo["local_path"]).relative_to(config.PHOTOS_DIR)
                photo["display_url"] = f"/photos/{rel.as_posix()}"
            else:
                photo["display_url"] = photo.get("source_url")
    return properties


@app.route("/api/search/<int:search_id>/properties")
def search_properties(search_id):
    properties = _with_display_urls(db.list_properties(search_id))
    return jsonify({"properties": properties})


@app.route("/api/searches/properties")
def searches_properties():
    """Like /api/search/<id>/properties, but combines several searches at
    once (e.g. one search per town) so they can be reviewed and reported
    on together."""
    ids_param = request.args.get("ids", "")
    search_ids = [int(x) for x in ids_param.split(",") if x.strip().isdigit()]
    properties = []
    for search_id in search_ids:
        for prop in db.list_properties(search_id):
            prop["search_id"] = search_id
            properties.append(prop)
    return jsonify({"properties": _with_display_urls(properties)})


@app.route("/photos/<path:subpath>")
def serve_photo(subpath):
    return send_from_directory(config.PHOTOS_DIR, subpath)


@app.route("/api/properties/<int:property_id>/select", methods=["POST"])
def toggle_property(property_id):
    body = request.get_json(force=True) or {}
    db.set_property_selected(property_id, bool(body.get("selected", True)))
    return jsonify({"ok": True})


def _search_label(search: dict) -> str:
    params = json.loads(search["params_json"])
    if params.get("location"):
        return params["location"]
    return "custom Zillow search"


@app.route("/api/search/<int:search_id>/report", methods=["POST"])
def generate_report(search_id):
    return _build_report_response([search_id])


@app.route("/api/report", methods=["POST"])
def generate_combined_report():
    """Build one PDF from properties selected across multiple searches
    (e.g. a separate search per town)."""
    body = request.get_json(force=True) or {}
    search_ids = [int(x) for x in (body.get("search_ids") or [])]
    if not search_ids:
        return jsonify({"error": "No searches specified."}), 400
    return _build_report_response(search_ids)


def _build_report_response(search_ids: list[int]):
    searches = [db.get_search(sid) for sid in search_ids]
    if any(s is None for s in searches):
        return jsonify({"error": "not found"}), 404

    selected = []
    for sid in search_ids:
        selected.extend(db.get_selected_properties(sid))
    if not selected:
        return jsonify({"error": "No properties selected for the report."}), 400

    search_summary = " + ".join(_search_label(s) for s in searches)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    ids_part = "-".join(str(s) for s in search_ids)
    filename = f"home_search_report_{ids_part}_{timestamp}.pdf"
    output_path = config.REPORTS_DIR / filename

    build_and_render(selected, search_summary, output_path)

    return jsonify({"filename": filename, "download_url": f"/api/reports/{filename}"})


@app.route("/api/reports/<path:filename>")
def download_report(filename):
    return send_file(config.REPORTS_DIR / filename, as_attachment=True)


if __name__ == "__main__":
    app.run(debug=True, port=5050)
