"""Everyday prices per city (a cheap meal, a mid-range dinner, a fast-food meal, a beer in a bar and from a shop,
a cappuccino, a local transport ticket), independent of any research set. Two crowd-sourced sources, both read
with plain HTTP where robots.txt allows it, pages cached in places/raw/:
- Numbeo city pages (numbeo.com/cost-of-living/in/<City>?displayCurrency=EUR). Free users get a monthly page
  limit; once Numbeo answers "Monthly page limit reached" the script stops asking and uses what is cached. Its
  "prices by city" list for draft beer covers most cities in one page.
- LivingCost.org city pages (livingcost.org/cost/<country>/<city>), prices in USD, converted with fx.json.
places.py merges them: Numbeo first, LivingCost scaled to Numbeo's level for the gaps.
Run: py -3 -X utf8 -I research/scripts/prices.py [--numbeo] [--refresh]"""
import argparse
import html
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT, UA, load_json, save_json  # noqa: E402

PLACES = ROOT / "places"
RAW = PLACES / "raw"
NB = "https://www.numbeo.com/cost-of-living/in/"
NB_BEER = "https://www.numbeo.com/cost-of-living/prices_by_city.jsp?displayCurrency=EUR&itemId=4"
LC = "https://livingcost.org/cost/"
NB_SLUGS = {"TCI": "Santa-Cruz-De-Tenerife", "LPA": "Las-Palmas", "KRK": "Krakow-Cracow", "SVQ": "Sevilla",
            "PMI": "Palma-De-Mallorca", "WRO": "Wroclaw"}
LC_COUNTRY = {"CZ": "czech-republic", "BA": "bosnia-and-herzegovina", "MK": "north-macedonia", "GB": "united-kingdom",
              "TR": "turkey"}
LC_CITY = {"TCI": "Tenerife", "LPA": "Las Palmas", "MLA": "Valletta", "SGN": "Ho Chi Minh"}
NB_ITEMS = [  # (field, label start, occurrence): the markets section repeats "Imported Beer"
    ("mealCheap", "Meal at an Inexpensive Restaurant", 1), ("mealMid2", "Meal for Two at a Mid-Range Restaurant", 1),
    ("fastFood", "Combo Meal at McDonald", 1), ("beerBar", "Domestic Draft Beer (0.5", 1),
    ("beerImportBar", "Imported Beer (0.33", 1), ("cappuccino", "Cappuccino", 1), ("beerShop", "Domestic Beer (0.5", 1),
    ("beerImportShop", "Imported Beer (0.33", 2), ("wine", "Bottle of Wine (Mid-Range)", 1),
    ("transit", "One-Way Ticket (Local Transport)", 1), ("taxiStart", "Taxi Start", 1), ("taxiKm", "Taxi 1 km", 1)]
LC_ITEMS = [("mealCheap", "Lunch Menu"), ("mealMid2", "Dinner in a Restaurant, for 2"), ("fastFood", "Fast food meal"),
            ("beerBar", "Beer in a Pub"), ("cappuccino", "Cappuccino"), ("transit", "Local transport ticket"),
            ("beerShop", "Beer, 0.5 L")]
LIMIT = "Monthly page limit reached"


def text(h):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h))).strip()


def fold(s):
    return unicodedata.normalize("NFKD", s.replace("ł", "l").replace("Ł", "L")).encode("ascii", "ignore").decode().lower()


def short(name):
    return fold(name.split(",")[0].split(" (")[0])


def fetch(url):
    """One polite request; no retries, so a rate limit is noticed instead of hammered."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return 0, str(e)
    finally:
        time.sleep(2.5)


def cached(path, url, refresh, ok=lambda h: True):
    """The page from the cache, else fetched and cached. Returns LIMIT when the site says we are rate-limited."""
    if path.exists() and not refresh:
        h = path.read_text(encoding="utf-8")
        if ok(h):
            return h
    status, h = fetch(url)
    if status == 429 or LIMIT in h:
        return LIMIT
    if status != 200 or not ok(h):
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(h, encoding="utf-8")
    return h


def numbeo_page(h):
    items, seen = {}, {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if len(cells) < 2:
            continue
        label = text(cells[0])
        for field, start, nth in NB_ITEMS:
            if not label.startswith(start):
                continue
            seen[start] = seen.get(start, 0) + 1
            m = re.search(r"([\d,]+\.\d+)", text(cells[1]))
            if seen[start] != nth or field in items or not m:
                continue
            rng = re.findall(r"([\d,]+\.\d+)", text(cells[2])) if len(cells) > 2 else []
            num = lambda s: float(s.replace(",", ""))  # noqa: E731
            items[field] = {"eur": num(m.group(1)), "low": num(rng[0]) if len(rng) > 1 else None, "high": num(rng[1]) if len(rng) > 1 else None}
    stats = re.search(r"had ([\d,]+) entries in the past 12 months by ([\d,]+) different contributors", h)
    upd = re.search(r"Last update: ([A-Za-z0-9 ]+?\d{4})", h)
    return {"items": items, "entries": int(stats.group(1).replace(",", "")) if stats else None,
            "contributors": int(stats.group(2).replace(",", "")) if stats else None, "updated": upd.group(1).strip() if upd else None}


def numbeo(cities, refresh, fetch_new):
    beer_list = cached(RAW / "numbeo" / "index.html", NB_BEER, refresh, ok=lambda t: "Draft Beer" in t)
    beer_list = "" if beer_list in (None, LIMIT) else beer_list
    listed = re.findall(r'href="https://www\.numbeo\.com/cost-of-living/in/([^"]+)">([^<]+)</a></td><td[^>]*>([\d.,]+)</td>', beer_list)
    by_name = {short(label): (slug, float(v.replace(",", ""))) for slug, label, v in listed}
    by_slug = {slug: float(v.replace(",", "")) for slug, _, v in listed}
    out, blocked = {}, False
    for c in cities:
        slug, beer = NB_SLUGS.get(c["code"]), None
        hit = by_name.get(short(c["name"]))
        if hit:
            slug = slug or hit[0]
            beer = hit[1]
        if beer is None and slug in by_slug:
            beer = by_slug[slug]
        slug = slug or re.sub(r"\s+", "-", short(c["name"]).title())
        path = RAW / "numbeo" / f"{c['code']}.html"
        ok = lambda t: "Domestic Draft Beer" in t  # noqa: E731
        h = path.read_text(encoding="utf-8") if path.exists() and not refresh else None
        if not (h and ok(h)) and not blocked and fetch_new:
            h = cached(path, f"{NB}{slug}?displayCurrency=EUR", refresh, ok=ok)
            if h == LIMIT:
                print("  Numbeo: monthly page limit reached; using cached pages and the beer list from here on")
                blocked, h = True, None
        rec = {"url": f"{NB}{slug}"}
        if h and "Domestic Draft Beer" in h:
            rec.update(numbeo_page(h))
        elif beer is not None:
            rec.update({"items": {"beerBar": {"eur": beer, "low": None, "high": None}}, "fromList": True})
        else:
            continue
        out[c["code"]] = rec
    return out


def livingcost_page(h, usd):
    items = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S):
        th = re.search(r"<th[^>]*>(.*?)</th>", row, re.S)
        val = re.search(r'data-usd="([\d.]+)"', row)
        if not th or not val:
            continue
        label = text(th.group(1))
        label = re.sub(r"^\W+", "", label)
        for field, start in LC_ITEMS:
            if label.startswith(start) and field not in items:
                items[field] = {"eur": round(float(val.group(1)) / usd, 2)}
    upd = re.search(r'Updated: <time datetime="(\d{4}-\d{2}-\d{2})', h)
    return {"items": items, "updated": upd.group(1) if upd else None}


def livingcost(cities, refresh):
    usd = load_json(ROOT / "2026-12-europe" / "fx.json")["rates"]["USD"]
    out, countries = {}, {}
    for c in cities:
        cs = LC_COUNTRY.get(c["cc"]) or re.sub(r"\s+", "-", fold(c["country"]))
        if cs not in countries:
            h = cached(RAW / "livingcost" / f"country-{cs}.html", f"{LC}{cs}", refresh, ok=lambda t: "/cost/" in t)
            h = "" if h in (None, LIMIT) else h
            # city links are /cost/<country>/<city> or /cost/<country>/<region>/<city>; the last part is the English name
            paths = re.findall(rf'href="https://livingcost\.org/cost/{cs}/((?:[a-z0-9-]+/)?[a-z0-9-]+)"', h)
            countries[cs] = {}
            for s in paths:
                countries[cs].setdefault(s.rsplit("/", 1)[-1], s)
        want = re.sub(r"[^a-z0-9]+", "-", short(LC_CITY.get(c["code"], c["name"]))).strip("-")
        slug = countries[cs].get(want) or next((s for n, s in countries[cs].items() if n.startswith(want + "-")), None)
        if not slug:
            print(f"  LivingCost: no page for {c['code']} {c['name']} in {cs}")
            continue
        h = cached(RAW / "livingcost" / f"{c['code']}.html", f"{LC}{cs}/{slug}", refresh, ok=lambda t: "Beer in a Pub" in t)
        if not h or h == LIMIT:
            print(f"  LivingCost: could not read {cs}/{slug}")
            continue
        out[c["code"]] = {"url": f"{LC}{cs}/{slug}", **livingcost_page(h, usd)}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="fetch the pages again")
    ap.add_argument("--numbeo", action="store_true", help="also ask Numbeo for city pages not cached yet (monthly limit)")
    args = ap.parse_args()
    cities = load_json(PLACES / "cities.json")
    nb, lc = numbeo(cities, args.refresh, args.numbeo or args.refresh), livingcost(cities, args.refresh)
    save_json(PLACES / "prices.json", {
        "fetched": time.strftime("%Y-%m-%d"),
        "sources": {"numbeo": {"label": "Numbeo", "url": "https://www.numbeo.com/cost-of-living/"},
                    "livingcost": {"label": "LivingCost.org", "url": "https://livingcost.org/"}},
        "numbeo": nb, "livingcost": lc})
    full = sum(1 for v in nb.values() if not v.get("fromList"))
    print(f"Numbeo: {full} city pages, {len(nb) - full} beer-list only; LivingCost: {len(lc)} cities")


if __name__ == "__main__":
    main()
