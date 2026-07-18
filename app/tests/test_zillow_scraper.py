from scraper.zillow_scraper import _extract_detail_urls, _parse_detail_page, build_basic_search_url

SEARCH_RESULTS_HTML = """
<html><body>
<a href="/homedetails/123-Main-St-Springfield-IL-62704/123456_zpid/">123 Main St</a>
<a href="/homedetails/456-Oak-Ave-Springfield-IL-62704/654321_zpid/">456 Oak Ave</a>
<a href="/homedetails/123-Main-St-Springfield-IL-62704/123456_zpid/">duplicate link, same card</a>
</body></html>
"""


def test_build_basic_search_url_slugifies_location():
    url = build_basic_search_url("Austin, TX")
    assert url == "https://www.zillow.com/homes/for_sale/Austin-TX_rb/"


def test_build_basic_search_url_respects_status():
    url = build_basic_search_url("Denver, CO", status="for_rent")
    assert "/homes/for_rent/Denver-CO_rb/" == url.replace("https://www.zillow.com", "")


def test_extract_detail_urls_dedupes_by_zpid():
    urls = _extract_detail_urls(SEARCH_RESULTS_HTML, "https://www.zillow.com/homes/for_sale/Springfield-IL_rb/")
    assert len(urls) == 2
    assert any("123456_zpid" in u for u in urls)
    assert any("654321_zpid" in u for u in urls)


def test_extract_detail_urls_returns_absolute_urls():
    urls = _extract_detail_urls(SEARCH_RESULTS_HTML, "https://www.zillow.com/homes/for_sale/Springfield-IL_rb/")
    assert all(u.startswith("https://www.zillow.com/homedetails/") for u in urls)


def test_parse_detail_page_falls_back_to_og_tags_when_json_missing():
    html = """
    <html><head>
    <meta property="og:title" content="123 Main St, Springfield, IL 62704">
    <meta property="og:image" content="https://example.com/photo1.jpg">
    </head><body>no next data here</body></html>
    """
    prop = _parse_detail_page(html, "https://www.zillow.com/homedetails/x/123_zpid/")
    assert prop.address == "123 Main St"
    assert len(prop.photos) == 1
    assert prop.photos[0]["url"] == "https://example.com/photo1.jpg"
