"""Google Flights one-way fares between European cities on the exact dates multi-city trips use.
Reads the composed set to find the intercity legs trips use (from, to, travel date), queries each once (all airlines),
and writes legs/google-inter.json. Resumable via raw/google/inter-*.json.
Run after compose.py: py -3 -u -X utf8 -I research/scripts/google_inter.py [--max 1200] [--workers 3] [--no-fetch]"""
import concurrent.futures as cf
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SET, CAPTURED, ROOT, save_json, load_json, seed  # noqa: E402
import google_flights as gf  # noqa: E402

COMPOSED = ROOT / "2026-12-europe.json"


def wanted_pairs(limit):
    data = load_json(COMPOSED)
    legs = {l["id"]: l for l in data["legs"]}
    seen, out = set(), []
    for t in data["trips"]:  # trips are sorted cheapest first, so the most relevant pairs come first
        if t["kind"] == "single":
            continue
        for lid, d in zip(t["legs"], t["legDates"]):
            l = legs.get(lid)
            if not l or l["fromCity"] == "TRD" or l["toCity"] == "TRD":
                continue
            key = (l["fromCity"], l["toCity"], d)
            if key in seen:
                continue
            seen.add(key)
            out.append(key)
            if len(out) >= limit:
                return out
    return out


NO_FETCH = "--no-fetch" in sys.argv  # rebuild legs from saved searches only (browser captures included)


def run(q):
    path = gf.RAW / f"{q['key']}.json"
    if path.exists():
        return q, load_json(path)
    if NO_FETCH:
        return q, None
    url = gf.BASE + gf.tfs([(q["date"], q["from"], q["to"])], 2)
    html = gf.fetch(url)
    if html is None:
        return q, None
    its = []
    for lab in gf.labels(html):
        p = gf.parse_label(lab)
        if p:
            p["label"] = lab
            its.append(p)
    via = "html"
    if not its and "Loading results" in html:
        payloads = gf.shop(html)
        if payloads is None:
            return q, None
        its = gf.parse_offers(payloads, False)
        via = "rpc"
    rec = {"url": url, "priceUnavailable": html.count("Price unavailable"), "via": via, "itineraries": its}
    save_json(path, rec)
    return q, rec


def main():
    args = sys.argv[1:]
    limit = int(args[args.index("--max") + 1]) if "--max" in args else 1200
    workers = int(args[args.index("--workers") + 1]) if "--workers" in args else 3
    airport = {d["code"]: d["airports"][0] for d in seed()}
    qs = [{"key": f"inter-{a}-{b}-{d}", "from": a, "to": b, "date": d} for a, b, d in wanted_pairs(limit)]
    print(f"intercity queries: {len(qs)}", flush=True)
    done = 0
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        for _ in ex.map(run, qs):
            done += 1
            if done % 100 == 0:
                print(f"  {done}/{len(qs)}", flush=True)
    legs, seen = [], set()
    for q in qs:
        rec = load_json(gf.RAW / f"{q['key']}.json")
        if not rec:
            continue
        its = [i for i in rec["itineraries"] if i.get("price")]
        best = {}
        for i in sorted(its, key=lambda x: (x["price"], x.get("durationMin") or 9999)):
            best.setdefault(i.get("airlines") or "?", i)
        for name, i in list(best.items())[:4]:
            slug = re.sub(r"[^a-z0-9]+", "", name.lower())[:24]
            lid = f"gfi-{q['from']}-{q['to']}-{q['date']}-{slug}"
            if lid in seen:
                continue
            seen.add(lid)
            lay = i["layovers"]
            missing = (["overhead bin (cabin bag must fit under the seat)"] if i["noOverheadBin"] else []) + ["checked bag (most economy-light fares)"]
            legs.append({
                "id": lid, "kind": "flight", "from": i.get("depCode") or gf.airport_code(i.get("depAirportName"), airport[q["from"]]),
                "to": i.get("arrCode") or gf.airport_code(i.get("arrAirportName"), airport[q["to"]]), "fromCity": q["from"], "toCity": q["to"],
                "flights": i.get("flights"),
                "date": q["date"], "returnDate": None, "roundTrip": False, "operator": name, "operatedBy": i.get("operatedBy"),
                "stops": i.get("stops"), "via": [l.get("city") or l.get("airport") for l in lay], "durationMin": i.get("durationMin"),
                "durationBackMin": None, "layoverMin": max([l["min"] for l in lay] or [0]),
                "overnight": any(l["overnight"] for l in lay) or (i.get("durationMin") or 0) >= 720,
                "depTime": i.get("depTime"), "arrTime": i.get("arrTime"), "arrDate": i.get("arrDate"),
                "priceEUR": i["price"], "priceMaxEUR": None, "priceOriginal": i["price"], "currencyOriginal": "EUR", "fareType": "adult",
                "url": rec["url"], "source": "google-flights", "searchGroup": "inter",
                "includes": ["personal item"] + ([] if i["noOverheadBin"] else ["cabin bag (overhead bin)"]), "missing": missing,
                "capturedAt": CAPTURED, "notes": "; ".join(f"layover {round(l['min'] / 60, 1)} h at {l.get('airport')}" for l in lay) or "nonstop",
            })
    save_json(SET / "legs" / "google-inter.json", legs)
    print(f"done: {len(legs)} intercity flight legs", flush=True)


if __name__ == "__main__":
    main()
