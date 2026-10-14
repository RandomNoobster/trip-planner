"""Rome2Rio: train, bus and flight options with price ranges between seed cities up to MAX_KM apart.
Parses the route objects embedded in the page. Writes legs/rome2rio.json. Rome2Rio's robots.txt allows these pages but it
rate-limits after about 80 quick requests, so runs are paced (--sleep seconds between pages, jittered) and pause for
--pause seconds when refused; pairs already fetched, or fetched with nothing usable, are skipped on the next run.
Run: py -3 -X utf8 -I -u research/scripts/rome2rio.py [--sleep 25] [--max-km 650] [--limit N]"""
import argparse
import random
import re
import time
import unicodedata
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SET, CAPTURED, get, save_json, load_json, seed, haversine_km, to_eur

MAX_KM = 800
SKIP = {"LPA", "TCI", "FNC", "MLA", "LCA", "REK", "PMI", "DUB", "IST", "CTA", "PMO", "HEL"}  # islands and rail dead ends
GB = {"LON", "EDI", "GLA", "MAN"}
CHANNEL = {"PAR", "BRU", "AMS"}  # the only mainland cities with a direct train to London
NAME_OVERRIDES = {"STO": "Stockholm", "BUH": "Bucharest", "LON": "London", "ROM": "Rome", "MIL": "Milan", "VCE": "Venice",
                  "NAP": "Naples", "TRN": "Turin", "MUC": "Munich", "CGN": "Cologne", "PRG": "Prague",
                  "VIE": "Vienna", "WAW": "Warsaw", "KRK": "Krakow", "GDN": "Gdansk", "WRO": "Wroclaw", "POZ": "Poznan",
                  "SVQ": "Seville", "AGP": "Malaga", "NCE": "Nice-France", "SPU": "Split-Croatia", "BRI": "Bari-Italy",
                  "PMI": "Palma-de-Mallorca", "IST": "Istanbul", "ATH": "Athens", "LIS": "Lisbon", "BRU": "Brussels", "GVA": "Geneva",
                  "ZRH": "Zurich", "BSL": "Basel", "FLR": "Florence-Italy", "FRA": "Frankfurt-am-Main", "VLC": "Valencia-Spain",
                  "BOD": "Bordeaux-France", "SZG": "Salzburg-Austria", "SXB": "Strasbourg-France", "BIO": "Bilbao-Spain",
                  "LUX": "Luxembourg-City", "HER": "Heraklion", "AYT": "Antalya", "RAK": "Marrakesh", "AGA": "Agadir"}
# Route objects in the page's serialized state. Place names that repeat on a page are stored once and referenced as a
# variable (h:"Munich",i:_.c), and a value can be defined in place (_.K="Train"), so each of h, i, j takes any of the three.
_VAL = r'(?:"(?P<{0}>[^"]*)"|_\.\w+(?:="(?P<{0}2>[^"]*)")?)'
ROUTE_RE = re.compile(
    r'\{g:\[(?P<segs>[^\]]*)\],h:' + _VAL.format("h") + ',i:' + _VAL.format("i") + ',j:' + _VAL.format("slug") +
    r'(?P<mid>[^{}]*?)s:(?P<secs>\d+),'
    r't:\{priceLow:(?P<lo>\d+),price:(?P<typ>\d+),priceHigh:(?P<hi>\d+),currencyCode:"(?P<cur>\w+)"\}')
KIND_RE = re.compile(r'transitSubKind:"(\w+)"')
LABEL_RE = re.compile(r'p:"([^"]*)"')


def slug(d):
    if d["code"] in NAME_OVERRIDES:
        return NAME_OVERRIDES[d["code"]]
    s = d["name"].split(",")[0].split(" (")[0]
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    return s.replace(" ", "-")


def parse(html):
    routes = []
    for m in ROUTE_RE.finditer(html):
        kinds = KIND_RE.findall(m.group("segs"))
        label_m = LABEL_RE.search(m.group("mid"))
        slug = m.group("slug") or m.group("slug2") or (label_m.group(1) if label_m else "")
        label = label_m.group(1) if label_m else slug
        routes.append({"kinds": kinds, "label": label, "slug": slug, "secs": int(m.group("secs")),
                       "low": int(m.group("lo")), "typical": int(m.group("typ")), "high": int(m.group("hi")), "cur": m.group("cur")})
    return routes


def route_kind(kinds):
    ks = {"train" if k in ("nighttrain", "lightrail", "subway", "tram") else "bus" if k in ("nightbus", "busferry") else k for k in kinds}
    if not ks or ks & {"car", "drive", "taxi", "ferry", "rideshare", "shuttle", "walk"} and not ks & {"train", "bus", "plane"}:
        return None
    if ks & {"car", "drive", "taxi", "ferry", "rideshare"}:
        return None
    if "plane" in ks:
        return "flight"
    if ks == {"train"} or ks <= {"train", "walk"}:
        return "train"
    if ks == {"bus"} or ks <= {"bus", "walk"}:
        return "bus"
    return "train+bus"


def crosses_channel(a, b):
    return (a["code"] in GB) != (b["code"] in GB) and not ({a["code"], b["code"]} & {"LON"} and {a["code"], b["code"]} & CHANNEL)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sleep", type=float, default=25.0, help="seconds between pages (jittered)")
    ap.add_argument("--pause", type=float, default=900.0, help="seconds to wait after a refusal")
    ap.add_argument("--max-km", type=float, default=MAX_KM)
    ap.add_argument("--limit", type=int, default=0, help="stop after this many pages")
    ap.add_argument("--pairs", default="", help="explicit pairs such as BKK-SIN,TYO-SEL (any distance, islands allowed)")
    args = ap.parse_args()
    by_code = {d["code"]: d for d in seed()}
    dests = [d for d in seed() if d["code"] not in SKIP]
    pairs = []
    if args.pairs:
        for pr in args.pairs.split(","):
            x, y = pr.strip().split("-")
            if x in by_code and y in by_code:
                a, b = by_code[x], by_code[y]
                pairs.append((haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]), a, b))
    for i, a in enumerate(dests if not args.pairs else []):
        for b in dests[i + 1:]:
            k = haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])
            if k <= args.max_km and not crosses_channel(a, b):
                pairs.append((k, a, b))
    pairs.sort(key=lambda t: t[0])  # nearest pairs first: the likeliest train trips
    legs = load_json(SET / "legs" / "rome2rio.json", [])
    tried_path = SET / "raw" / "rome2rio-tried.json"
    tried = set(load_json(tried_path, []))
    done = {(l["from"], l["to"]) for l in legs} | {tuple(t.split("-")) for t in tried}
    todo = [(a, b) for _, a, b in pairs if (a["code"], b["code"]) not in done and (b["code"], a["code"]) not in done]
    print(f"pairs within {args.max_km:.0f} km: {len(pairs)}, to fetch: {len(todo)}", flush=True)
    errors = fetched = 0
    for n, (a, b) in enumerate(todo):
        if args.limit and fetched >= args.limit:
            break
        url = f"https://www.rome2rio.com/s/{slug(a)}/{slug(b)}"
        status, body = get(url, sleep=0, retries=1)
        time.sleep(args.sleep * random.uniform(0.7, 1.3))
        if status != 200 or not body:
            errors += 1
            print(f"  {a['code']}-{b['code']}: status {status}; pausing {args.pause:.0f} s", flush=True)
            if errors > 6:
                print("  refused six times; stopping, rerun later", flush=True)
                break
            time.sleep(args.pause)
            continue
        errors = 0
        fetched += 1
        tried.add(f"{a['code']}-{b['code']}")
        routes = parse(body.decode("utf-8", "replace"))
        kept = 0
        for r in routes:
            kind = route_kind(r["kinds"])
            if not kind:
                continue
            low, typ, high = (to_eur(r["low"], r["cur"]), to_eur(r["typical"], r["cur"]), to_eur(r["high"], r["cur"]))
            if low is None:
                continue
            mins = r["secs"] // 60
            for x, y in ((a, b), (b, a)):
                legs.append({
                    "id": f"r2r-{x['code']}-{y['code']}-{re.sub(r'[^A-Za-z0-9]+', '', r['slug'])[:24]}",
                    "kind": kind, "from": x["code"], "to": y["code"], "fromCity": x["code"], "toCity": y["code"],
                    "date": None, "returnDate": None, "roundTrip": False,
                    "operator": r["label"], "stops": max(0, len(r["kinds"]) - 1), "via": [], "durationMin": mins,
                    "durationBackMin": None, "layoverMin": None, "overnight": mins > 720 or "night" in r["label"].lower(),
                    "priceEUR": low, "priceTypicalEUR": typ, "priceMaxEUR": high, "priceOriginal": r["low"], "currencyOriginal": r["cur"],
                    "url": f"https://www.rome2rio.com/map/{slug(x)}/{slug(y)}",
                    "source": "rome2rio", "includes": ["luggage"] if kind != "flight" else [],
                    "missing": [] if kind != "flight" else ["checked bag (airline dependent)"],
                    "capturedAt": CAPTURED,
                    "notes": f"indicative range from Rome2Rio ({r['label']}); reverse direction assumed equal" if x is b else f"indicative range from Rome2Rio ({r['label']})",
                })
                kept += 1
        print(f"  {a['code']}-{b['code']}: {len(routes)} routes, {kept} legs", flush=True)
        if fetched % 10 == 0:
            save_json(SET / "legs" / "rome2rio.json", legs)
            save_json(tried_path, sorted(tried))
    save_json(SET / "legs" / "rome2rio.json", legs)
    save_json(tried_path, sorted(tried))
    print(f"done: {len(legs)} legs, fetched {fetched} pages", flush=True)


if __name__ == "__main__":
    main()
