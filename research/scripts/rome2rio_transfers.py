"""Airport-to-city transfers from Rome2Rio for every airport in the seed list (and Trondheim Værnes).
Writes transfers/rome2rio.json in the same shape the research agents use; compose.py prefers agent figures and
fills gaps from this file. Run: py -3 -u -X utf8 -I research/scripts/rome2rio_transfers.py"""
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SET, get, load_json, save_json, seed, to_eur  # noqa: E402

ROUTE_RE = re.compile(
    r'\{g:\[(?P<segs>[^\]]*)\],h:(?:"[^"]*"|_\.\w+),i:(?:"[^"]*"|_\.\w+),j:(?:"[^"]*"|_\.\w+)(?P<mid>[^{}]*?)s:(?P<secs>\d+),'
    r't:\{priceLow:(?P<lo>\d+),price:(?P<typ>\d+),priceHigh:(?P<hi>\d+),currencyCode:"(?P<cur>\w+)"\}')
KIND_RE = re.compile(r'transitSubKind:"(\w+)"')
PUBLIC = {"train", "bus", "tram", "subway", "metro", "lightrail", "shuttle", "nightbus", "busferry", "cablecar", "funicular"}
AIRPORT_NAMES = {"TRD": "Trondheim-Airport-Vaernes"}
CITY_NAMES = {"TRD": "Trondheim-Norway", "LON": "London-UK", "PAR": "Paris-France", "ROM": "Rome-Italy", "MIL": "Milan-Italy",
              "STO": "Stockholm-Sweden", "BUH": "Bucharest-Romania", "TCI": "Santa-Cruz-de-Tenerife", "REK": "Reykjavik-Iceland",
              "MLA": "Valletta-Malta", "LCA": "Larnaca-Cyprus", "FNC": "Funchal-Madeira", "PMI": "Palma-de-Mallorca", "LPA": "Las-Palmas-de-Gran-Canaria"}


def slug(text):
    t = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    return re.sub(r"[^A-Za-z0-9]+", "-", t).strip("-")


def city_slug(d):
    return CITY_NAMES.get(d["code"]) or f"{slug(d['name'].split(',')[0].split(' (')[0])}-{slug(d['country'])}"


def airport_slug(code, city_name):
    return AIRPORT_NAMES.get(code) or f"{slug(city_name)}-Airport-{code}"


def options(html):
    pub, taxi = [], []
    for m in ROUTE_RE.finditer(html):
        kinds = set(KIND_RE.findall(m.group("segs")))
        if not kinds or "plane" in kinds:
            continue
        lo, typ = to_eur(int(m.group("lo")), m.group("cur")), to_eur(int(m.group("typ")), m.group("cur"))
        mins = int(m.group("secs")) // 60
        if kinds <= {"taxi", "car", "rideshare"} and "taxi" in kinds:
            taxi.append((typ, mins))
        elif kinds <= PUBLIC | {"walk"}:
            pub.append((lo, mins, sorted(kinds)))
    return pub, taxi


def main():
    """--missing: only re-query airports that have neither a public nor a taxi figure yet, slowly (Rome2Rio rate-limits)."""
    missing_only = "--missing" in sys.argv
    path = SET / "transfers" / "zz-rome2rio.json"
    previous = {c["city"]: c for c in (load_json(path, []) or [])}
    out = []
    dests = seed() + [{"code": "TRD", "name": "Trondheim", "country": "Norway", "airports": ["TRD"]}]
    for d in dests:
        prev_airports = {a["code"]: a for a in (previous.get(d["code"], {}).get("airports") or [])}
        rec = {"city": d["code"], "localTicketEUR": None, "dayPassEUR": None, "rideHailing": [], "airports": [], "sources": [], "notes": "Rome2Rio estimates"}
        for code in d["airports"]:
            old = prev_airports.get(code)
            if missing_only and old and (old.get("public") or old.get("taxi")):
                rec["airports"].append(old)
                continue
            url = f"https://www.rome2rio.com/s/{airport_slug(code, d['name'].split(',')[0])}/{city_slug(d)}"
            st, body = get(url, sleep=4.0 if missing_only else 1.0)
            if st == 429:
                print("rate limited; stopping (rerun later with --missing)", flush=True)
                save_json(path, out + [rec] + [previous[c["code"]] for c in dests[dests.index(d) + 1:] if c["code"] in previous])
                return
            pub, taxi = options(body.decode("utf-8", "replace")) if st == 200 else ([], [])
            best_pub = min(pub, key=lambda x: (x[0], x[1])) if pub else None
            best_taxi = min(taxi, key=lambda x: x[0]) if taxi else None
            rec["airports"].append({
                "code": code,
                "public": {"mode": "/".join(best_pub[2]), "to": "city centre", "minutes": best_pub[1], "fareEUR": best_pub[0], "frequency": None, "hours": None} if best_pub else None,
                "taxi": {"fareEUR": best_taxi[0], "minutes": best_taxi[1], "basis": "Rome2Rio typical taxi fare", "capacity": 4} if best_taxi else None,
            })
            rec["sources"].append(url)
            print(f"{d['code']}/{code}: public {best_pub[:2] if best_pub else None}, taxi {best_taxi}", flush=True)
        out.append(rec)
    save_json(path, out)
    print(f"done: {len(out)} cities")


if __name__ == "__main__":
    main()
