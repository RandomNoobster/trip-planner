"""Airbnb search results for every seed city: entire homes and private rooms for 2, 4 and 5 adults, 7-15 Dec 2026.
Parses the server-rendered search state exactly (no guessing). Writes stays/airbnb/<CITY>.json and stays/airbnb.json.
Run: py -3 -X utf8 -I research/scripts/airbnb.py [--cheap | --high] [CITY ...]"""
import base64
import json
import math
import re
import sys
import time
import unicodedata
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SET, CAPTURED, get, save_json, load_json, seed

CHECKIN, CHECKOUT = "2026-12-07", "2026-12-15"
SEARCHES = [(2, 80), (4, 120), (5, 150)]  # (adults, max price per night in EUR): first pass
CHEAP_SEARCHES = [(2, 50), (3, 65), (4, 75), (5, 100), (6, 120)]  # second pass: the cheap end, run with --cheap
HIGH_SEARCHES = [(2, 160), (4, 250), (5, 320)]  # --high: December-peak cities (Christmas markets, Lapland) where the caps above find little
QUERY_OVERRIDES = {
    "LPA": "Las-Palmas-de-Gran-Canaria--Spain", "TCI": "Santa-Cruz-de-Tenerife--Spain", "FNC": "Funchal--Portugal",
    "MLA": "Valletta--Malta", "LCA": "Larnaca--Cyprus", "REK": "Reykjavik--Iceland", "PMI": "Palma--Spain",
    "STO": "Stockholm--Sweden", "BUH": "Bucharest--Romania", "LON": "London--United-Kingdom", "EDI": "Edinburgh--United-Kingdom",
    "GLA": "Glasgow--United-Kingdom", "MAN": "Manchester--United-Kingdom", "ROM": "Rome--Italy", "MIL": "Milan--Italy",
    "VCE": "Venice--Italy", "NAP": "Naples--Italy", "FLR": "Florence--Italy", "TRN": "Turin--Italy", "MUC": "Munich--Germany",
    "CGN": "Cologne--Germany", "PRG": "Prague--Czechia", "VIE": "Vienna--Austria", "WAW": "Warsaw--Poland", "KRK": "Krakow--Poland",
    "GDN": "Gdansk--Poland", "WRO": "Wroclaw--Poland", "POZ": "Poznan--Poland", "CPH": "Copenhagen--Denmark", "ATH": "Athens--Greece",
    "LIS": "Lisbon--Portugal", "SVQ": "Seville--Spain", "AGP": "Malaga--Spain", "BRU": "Brussels--Belgium", "GVA": "Geneva--Switzerland",
    "ZRH": "Zurich--Switzerland", "BSL": "Basel--Switzerland", "LJU": "Ljubljana--Slovenia", "SOF": "Sofia--Bulgaria", "BEG": "Belgrade--Serbia",
    "SKP": "Skopje--North-Macedonia", "SJJ": "Sarajevo--Bosnia-and-Herzegovina", "TIA": "Tirana--Albania", "IST": "Istanbul--Turkey",
}


BOX_KM = 9  # search only the map area this far around the centre: name searches returned cottages 30-70 km out
ISLANDS = {"LPA", "TCI", "FUE", "FNC", "MLA", "PMI"}  # island destinations search the whole island


def map_box(d):
    if d["code"] in ISLANDS:
        return ""
    dlat = BOX_KM / 111.0
    dlon = BOX_KM / (111.0 * max(0.2, math.cos(math.radians(d["lat"]))))
    return (f"&ne_lat={d['lat'] + dlat:.4f}&ne_lng={d['lon'] + dlon:.4f}&sw_lat={d['lat'] - dlat:.4f}"
            f"&sw_lng={d['lon'] - dlon:.4f}&search_by_map=true&zoom=12")


def ascii_slug(s):
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    return re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-")


def query_for(d):
    if d["code"] in QUERY_OVERRIDES:
        return QUERY_OVERRIDES[d["code"]]
    return ascii_slug(d["name"].split(",")[0].split(" (")[0]) + "--" + ascii_slug(d["country"])


def walk(o, out):
    if isinstance(o, dict):
        if o.get("__typename") == "StaySearchResult":
            out.append(o)
        for v in o.values():
            walk(v, out)
    elif isinstance(o, list):
        for v in o:
            walk(v, out)


def parse_money(s):
    if not s:
        return None
    m = re.search(r"([\d.,]+)", s.replace(" ", ""))
    if not m:
        return None
    num = m.group(1).replace(",", "")
    try:
        return float(num)
    except ValueError:
        return None


def parse_results(html):
    out = []
    for m in re.finditer(r'<script id="data-deferred-state-\d+"[^>]*>(.*?)</script>', html, re.S):
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        walk(data, out)
    return out


def room_type(title):
    t = (title or "").lower()
    if t.startswith("shared room") or "shared room" in t:
        return "shared_room"
    if t.startswith("room in") or t.startswith("private room"):
        if "hotel" in t or "aparthotel" in t or "boutique" in t:
            return "hotel_room"
        if "hostel" in t:
            return "hostel_private"
        return "private_room"
    if "hotel" in t:
        return "hotel_room"
    return "entire_home"


def to_record(r, city, adults, search_url):
    dsl = r.get("demandStayListing") or {}
    try:
        raw_id = base64.b64decode(dsl.get("id", "")).decode()
        lid = raw_id.split(":")[-1]
    except Exception:  # noqa: BLE001
        lid = None
    if not lid:
        return None
    title = r.get("title") or ""
    name = r.get("subtitle") or ((dsl.get("description") or {}).get("name") or {}).get("localizedStringWithTranslationPreference") or title
    price_line = (r.get("structuredDisplayPrice") or {}).get("primaryLine") or {}
    total = parse_money(price_line.get("discountedPrice") or price_line.get("price"))
    qualifier = (price_line.get("qualifier") or "").lower()
    nights = 8
    expl = ((r.get("structuredDisplayPrice") or {}).get("explanationData") or {}).get("priceDetails") or []
    for grp in expl:
        for it in grp.get("items") or []:
            mm = re.search(r"(\d+)\s*nights?", it.get("description") or "")
            if mm:
                nights = int(mm.group(1))
    if total is None:
        return None
    if "night" in qualifier and "total" not in qualifier:
        nightly, total = total, total * nights
    else:
        nightly = total / nights if nights else None
    rating, reviews = None, 0
    lab = r.get("avgRatingA11yLabel") or ""
    mm = re.search(r"([\d.]+) out of 5 average rating,\s*([\d,]+) reviews?", lab)
    if mm:
        rating, reviews = float(mm.group(1)), int(mm.group(2).replace(",", ""))
    bedrooms, beds, baths, shared_bath = None, None, None, False
    for line in ((r.get("structuredContent") or {}).get("mapPrimaryLine") or []):
        body = (line.get("body") or "").lower()
        if line.get("type") == "BEDINFO":
            if "studio" in body:
                bedrooms = 0
            m1 = re.search(r"(\d+)\s*bedroom", body)
            if m1:
                bedrooms = int(m1.group(1))
            m2 = re.search(r"(\d+)\s*(?:double |single |queen |king |sofa |bunk )?beds?", body)
            if m2 and "bedroom" not in body:
                beds = int(m2.group(1))
        elif line.get("type") == "BATHROOMINFO":
            m3 = re.search(r"([\d.]+)\s*(shared )?bath", body)
            if m3:
                baths = float(m3.group(1))
                shared_bath = bool(m3.group(2)) or "shared" in body
    rt = room_type(title)
    coord = ((dsl.get("location") or {}).get("coordinate") or {})
    includes = ["wifi"]
    missing = ["breakfast"]
    if rt == "entire_home":
        includes += ["whole place to yourselves", "kitchen", "private bathroom"]
    elif rt == "private_room":
        missing += ["whole place (host or other guests in the home)"]
        if shared_bath:
            missing.append("private bathroom")
    elif rt == "hostel_private":
        missing += ["whole place"]
        if shared_bath:
            missing.append("private bathroom")
    elif rt == "hotel_room":
        includes.append("private bathroom")
        missing.append("kitchen")
    return {
        "id": f"{city}-airbnb-{lid}", "city": city, "platform": "airbnb", "name": name, "typeTitle": title, "roomType": rt,
        "sleeps": adults, "bedrooms": bedrooms, "beds": beds, "baths": baths,
        "checkin": CHECKIN, "checkout": CHECKOUT, "nights": nights,
        "totalEUR": round(total, 2), "nightlyEUR": round(nightly, 2) if nightly else None, "perPerson": False,
        "rating": rating, "ratingScale": 5, "reviews": reviews,
        "url": f"https://www.airbnb.com/rooms/{lid}?check_in={CHECKIN}&check_out={CHECKOUT}&adults={adults}&currency=EUR",
        "lat": coord.get("latitude"), "lon": coord.get("longitude"),
        "includes": includes, "missing": missing, "searchAdults": adults, "sourceUrl": search_url,
        "capturedAt": CAPTURED, "notes": "" if nights == 8 else f"price shown for {nights} nights (dates differ from 7-15 Dec)",
    }


def scrape_city(d, searches=SEARCHES):
    city = d["code"]
    records = {}
    failures = 0
    for adults, cap in searches:
        url = (f"https://www.airbnb.com/s/{query_for(d)}/homes?checkin={CHECKIN}&checkout={CHECKOUT}&adults={adults}"
               f"&currency=EUR&price_max={cap}{map_box(d)}")
        status, body = get(url, sleep=1.2)
        if status != 200 or not body:
            failures += 1
            print(f"  {city} adults={adults}: status {status}", file=sys.stderr)
            if status in (403, 429):
                time.sleep(25)
            continue
        html = body.decode("utf-8", "replace")
        results = parse_results(html)
        n_new = 0
        for r in results:
            rec = to_record(r, city, adults, url)
            if not rec or rec["roomType"] == "shared_room":
                continue
            prev = records.get(rec["id"])
            if prev is None or adults > prev["sleeps"]:
                if prev is not None:
                    rec["sleeps"] = adults
                records[rec["id"]] = rec
                n_new += 1
        print(f"  {city} adults={adults} cap={cap}: {len(results)} results, {n_new} kept")
    return list(records.values()), failures


def merge(old, new):
    by_id = {r["id"]: r for r in old}
    for r in new:
        prev = by_id.get(r["id"])
        if prev is None:
            by_id[r["id"]] = r
        else:
            prev["sleeps"] = max(prev["sleeps"], r["sleeps"])
            if r["nights"] == 8 and prev["nights"] != 8:
                by_id[r["id"]] = dict(r, sleeps=prev["sleeps"])
    return list(by_id.values())


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    cheap = "--cheap" in sys.argv
    searches = CHEAP_SEARCHES if cheap else HIGH_SEARCHES if "--high" in sys.argv else SEARCHES
    only = set(args)
    dests = [d for d in seed() if not only or d["code"] in only]
    combined = load_json(SET / "stays" / "airbnb.json", [])
    have = {r["city"] for r in combined}
    consecutive = 0
    for d in dests:
        if d["code"] in have and not only and not cheap:
            continue
        print(d["code"], d["name"])
        recs, failures = scrape_city(d, searches)
        if failures >= len(searches):
            consecutive += 1
            if consecutive >= 4:
                print("too many consecutive failures, stopping", file=sys.stderr)
                break
        else:
            consecutive = 0
        city_recs = merge(load_json(SET / "stays" / "airbnb" / f"{d['code']}.json", []), recs)
        save_json(SET / "stays" / "airbnb" / f"{d['code']}.json", city_recs)
        combined = [r for r in combined if r["city"] != d["code"]] + city_recs
        save_json(SET / "stays" / "airbnb.json", combined)
    print(f"total airbnb records: {len(combined)} across {len({r['city'] for r in combined})} cities")


if __name__ == "__main__":
    main()
