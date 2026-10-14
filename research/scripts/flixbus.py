"""FlixBus: cheapest available bus per city pair per date for pairs under MAX_KM apart.
Writes raw/flixbus/cities.json and legs/flixbus.json. Run: py -3 -X utf8 -I research/scripts/flixbus.py
Exact travel dates afterwards: py -3 -X utf8 -I research/scripts/flixbus.py --dated <queries.json> ([{from, to, date}])"""
import json
import sys
import unicodedata
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SET, CAPTURED, get, save_json, load_json, seed, haversine_km

MAX_KM = 650
DATES = ["2026-12-10", "2026-12-13"]
SKIP = {"LPA", "TCI", "FNC", "MLA", "LCA", "REK", "IST"}  # islands and non-bus markets
AUTO = "https://global.api.flixbus.com/search/autocomplete/cities?q={q}&lang=en&country={cc}&flixbus_cities_only=false&stations=false&popular_stations=false"
SEARCH = ("https://global.api.flixbus.com/search/service/v4/search?from_city_id={a}&to_city_id={b}&departure_date={d}"
          "&products=%7B%22adult%22%3A1%7D&currency=EUR&locale=en&search_by=cities&include_after_midnight_rides=1")


def ascii_name(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def city_ids(dests):
    path = SET / "raw" / "flixbus" / "cities.json"
    cache = load_json(path, {})
    for d in dests:
        if d["code"] in cache:
            continue
        name = d["name"].split(",")[0].split(" (")[0]
        found = None
        for q in (name, ascii_name(name)):
            status, body = get(AUTO.format(q=q.replace(" ", "%20"), cc=d["cc"]))
            if status != 200:
                continue
            try:
                items = json.loads(body)
            except json.JSONDecodeError:
                continue
            for it in items:
                if (it.get("country") or "").lower() == d["cc"].lower() and "airport" not in (it.get("name") or "").lower():
                    found = {"id": it["id"], "name": it.get("name")}
                    break
            if found:
                break
        cache[d["code"]] = found
        print(f"city {d['code']}: {found}")
    save_json(path, cache)
    return cache


def main():
    dests = [d for d in seed() if d["code"] not in SKIP]
    ids = city_ids(dests)
    pairs = []
    for i, a in enumerate(dests):
        for b in dests[i + 1:]:
            if haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]) <= MAX_KM and ids.get(a["code"]) and ids.get(b["code"]):
                pairs.append((a, b))
                pairs.append((b, a))
    print(f"pairs to query: {len(pairs)} x {len(DATES)} dates")
    legs = []
    errors = 0
    for n, (a, b) in enumerate(pairs):
        for date in DATES:
            ok, found = search(a["code"], b["code"], date, ids)
            if not ok:
                errors += 1
                if errors > 40:
                    print("too many errors, stopping", file=sys.stderr)
                    save_json(SET / "legs" / "flixbus.json", legs)
                    return
                continue
            legs.extend(found)
        if n % 50 == 0:
            print(f"{n}/{len(pairs)} pairs, {len(legs)} legs")
            save_json(SET / "legs" / "flixbus.json", legs)
    save_json(SET / "legs" / "flixbus.json", legs)
    print(f"done: {len(legs)} legs, {errors} errors")


def search(a, b, date, ids, sleep=0.35):
    """The cheapest bus (and the cheapest direct one) from city a to city b on date: (request ok, legs)."""
    d_fmt = f"{date[8:10]}.{date[5:7]}.{date[0:4]}"
    status, body = get(SEARCH.format(a=ids[a]["id"], b=ids[b]["id"], d=d_fmt), sleep=sleep)
    if status != 200 or not body:
        return False, []
    try:
        j = json.loads(body)
    except json.JSONDecodeError:
        return False, []
    results = []
    for trip in j.get("trips", []):
        res = trip.get("results") or {}
        for r in (res.values() if isinstance(res, dict) else res):
            if r.get("status") != "available":
                continue
            price = (r.get("price") or {}).get("total")
            if price is None:
                continue
            dur = r.get("duration") or {}
            mins = int(dur.get("hours", 0)) * 60 + int(dur.get("minutes", 0))
            results.append((float(price), r, mins))
    if not results:
        return True, []
    results.sort(key=lambda x: x[0])
    best = results[0]
    direct = next((x for x in results if x[1].get("transfer_type_key") == "direct"), None)
    picks = [("cheapest", best)]
    if direct and direct is not best:
        picks.append(("cheapest direct", direct))
    legs = []
    for label, (price, r, mins) in picks:
        dep = (r.get("departure") or {}).get("date", "")
        arr = (r.get("arrival") or {}).get("date", "")
        overnight = dep[:10] != arr[:10] or mins > 720
        legs.append({
            "id": f"fb-{a}-{b}-{date}-{'d' if label.endswith('direct') else 'c'}",
            "kind": "bus", "from": a, "to": b, "fromCity": a, "toCity": b,
            "date": date, "returnDate": None, "roundTrip": False,
            "operator": "FlixBus", "stops": 0 if r.get("transfer_type_key") == "direct" else 1,
            "via": [], "durationMin": mins, "durationBackMin": None, "layoverMin": None, "overnight": overnight,
            "priceEUR": round(price, 2), "priceMaxEUR": None, "priceOriginal": price, "currencyOriginal": "EUR",
            "url": (f"https://shop.flixbus.com/search?departureCity={ids[a]['id']}&arrivalCity={ids[b]['id']}"
                    f"&rideDate={d_fmt}&adult=1&_locale=en"),
            "source": "flixbus-api", "includes": ["1 checked bag", "1 hand luggage"], "missing": ["seat reservation"],
            "capturedAt": CAPTURED, "notes": f"{label}; departs {dep[11:16]}, arrives {arr[11:16]}; {r.get('transfer_type')}"
        })
    return True, legs


def dated(path):
    """Extra searches on the exact dates trips travel (a JSON list of {from, to, date}), merged into legs/flixbus.json.
    Paced at about one request a second; a second run skips searches already done."""
    queries = load_json(path, [])
    ids = load_json(SET / "raw" / "flixbus" / "cities.json", {})
    done_path = SET / "raw" / "flixbus" / "dated-done.json"
    done = set(load_json(done_path, []))
    legs = {l["id"]: l for l in load_json(SET / "legs" / "flixbus.json", [])}
    added = errors = skipped = 0
    for n, q in enumerate(queries):
        key = f"{q['from']}-{q['to']}-{q['date']}"
        if key in done:
            continue
        if not (ids.get(q["from"]) and ids.get(q["to"])):
            skipped += 1
            continue
        ok, found = search(q["from"], q["to"], q["date"], ids, sleep=1.1)
        if not ok:
            errors += 1
            if errors > 25:
                print("too many errors, stopping", file=sys.stderr)
                break
            continue
        for l in found:
            added += l["id"] not in legs
            legs[l["id"]] = l
        done.add(key)
        if n % 25 == 0:
            print(f"{n}/{len(queries)} searched, {added} new legs, {errors} errors", flush=True)
            save_json(SET / "legs" / "flixbus.json", list(legs.values()))
            save_json(done_path, sorted(done))
    save_json(SET / "legs" / "flixbus.json", list(legs.values()))
    save_json(done_path, sorted(done))
    print(f"done: {added} new legs, {errors} errors, {skipped} pairs without a FlixBus city")


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--dated":
        dated(sys.argv[2])
    else:
        main()
