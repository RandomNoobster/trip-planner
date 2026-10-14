"""Flights home for the travellers who split off at the end of a trip: Stavanger (Sola, SVG) and Tønsberg (Torp, TRF, or
Oslo Gardermoen, OSL, then the Vy train). Everyone flies home from the trip's last city on its last day, so the searches
are the (city, date) pairs the composed trips end on (raw/homes/pairs.json, written by --pairs from the composed set).

Sources, each into legs/homes.json:
  - Ryanair fare finder for the airports that fly to Torp or Oslo (raw/homes/ryanair-<AP>.json, --fetch): every day a route runs
  - Wizz Air timetable for every route into Torp, Sola and Oslo (raw/homes/wizz-<FROM>-<TO>.json, --fetch)
  - SAS offers read in the browser with scripts/sas_home_run.js (raw/homes/sas-*.json); SAS keeps its fares off Google
  - Google Flights one-ways read in the browser (queues raw/google-ui/queue-H<n>.json from --queue, results imported by
    google_ui_import.py into raw/google/home-<CITY>-<AIRPORT>-<DATE>.json)
Run: py -3 -X utf8 -I research/scripts/homes.py [--pairs] [--fetch] [--queue]   (no flag: build legs from what is saved)"""
import glob
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SET, UA, get, load_json, save_json, airport_to_city, to_eur, minutes_between  # noqa: E402
import google_flights as gf  # noqa: E402

RAW = SET / "raw" / "homes"
HOME_AIRPORTS = ("SVG", "TRF", "OSL")
GOOGLE_CODE = {"BUH": "OTP"}  # Google rejects the Bucharest metro code
RYANAIR_URL = ("https://www.ryanair.com/api/farfnd/v4/oneWayFares?departureAirportIataCode={a}&arrivalAirportIataCode={b}"
               "&outboundDepartureDateFrom=2026-12-04&outboundDepartureDateTo=2026-12-19&market=en-gb&adultPaxCount=1"
               "&searchMode=ALL&language=en&limit=500&offset=0")
NOK = 10.7155  # fx.json, 9 Oct 2026


def pairs():
    """(city, date, trips) the composed set's trips end on, most used first."""
    d = load_json(SET.parent / "2026-12-europe.json")
    legs = {l["id"]: l for l in d["legs"]}
    count = {}
    for t in d["trips"]:
        last = legs[t["legs"][-1]]
        key = (last["toCity"], last["returnDate"]) if last.get("roundTrip") else (last["fromCity"], last["date"])
        count[key] = count.get(key, 0) + 1
    out = sorted(([c, dt, n] for (c, dt), n in count.items()), key=lambda x: -x[2])
    save_json(RAW / "pairs.json", out)
    print(f"{len(out)} (city, date) pairs from {len(d['trips'])} trips")


def fetch():
    """Ryanair routes to Torp and Oslo (the Sola airport has no Ryanair) and every Wizz route into the three airports."""
    for p in sorted(glob.glob(str(SET / "raw" / "ryanair" / "*.json"))):
        dep = os.path.basename(p)[:-5]
        arrs = sorted({((f.get("outbound") or {}).get("arrivalAirport") or {}).get("iataCode") for f in load_json(p, [])} & set(HOME_AIRPORTS))
        for arr in arrs:
            status, body = get(RYANAIR_URL.format(a=dep, b=arr))
            if status == 200 and body:
                save_json(RAW / f"ryanair-{dep}-{arr}.json", json.loads(body).get("fares", []))
                print(f"ryanair {dep}-{arr}: {len(json.loads(body).get('fares', []))} days")
            time.sleep(0.5)
    import wizz
    api = wizz.api_base()
    stations = wizz.call(api, "/Api/asset/map?languageCode=en-gb").get("cities", [])
    for home in HOME_AIRPORTS:
        s = next((x for x in stations if x.get("iata") == home), None)
        for frm in sorted(c["iata"] for c in (s or {}).get("connections", [])):
            j = wizz.call(api, "/Api/search/timetable", {"flightList": [{"departureStation": frm, "arrivalStation": home, "from": "2026-12-04", "to": "2026-12-19"}],
                                                         "priceType": "regular", "adultCount": 1, "childCount": 0, "infantCount": 0})
            save_json(RAW / f"wizz-{frm}-{home}.json", j)
            print(f"wizz {frm}-{home}: {len(j.get('outboundFlights', []))} days")
            time.sleep(0.7)


def queue():
    """Google Flights one-ways from each trip-ending city to Sola and Oslo on the days trips end there, plus Torp where a
    direct flight exists (elsewhere Torp only has connections that Oslo plus the train beats). Most used pairs first."""
    torp_direct = {airport_to_city().get(os.path.basename(p).split("-")[1]) for p in glob.glob(str(RAW / "*-TRF.json"))}
    out = []
    for city, date, _n in load_json(RAW / "pairs.json", []):
        frm = GOOGLE_CODE.get(city, city)
        for home in ("SVG", "OSL") + (("TRF",) if city in torp_direct else ()):
            url = gf.BASE + gf.tfs([(date, frm, home)], 2)
            out.append({"key": f"home-{city}-{home}-{date}", "url": url, "trip": 2})
    size = 320  # one browser agent's run each, run one after another (Google refuses searches that come too fast)
    for i in range(0, len(out), size):
        save_json(SET / "raw" / "google-ui" / f"queue-H{i // size + 1}.json", out[i:i + size])
    print(f"queue-H1..H{(len(out) - 1) // size + 1}: {len(out)} searches")


def base(leg_id, frm, frm_city, to, date, operator, price, source, url, **kw):
    leg = {"id": leg_id, "kind": "flight", "from": frm, "to": to, "fromCity": frm_city, "toCity": to, "date": date, "returnDate": None,
           "roundTrip": False, "operator": operator, "stops": 0, "via": [], "durationMin": None, "durationBackMin": None, "layoverMin": 0,
           "overnight": False, "priceEUR": price, "priceMaxEUR": None, "fareType": "adult", "url": url, "source": source, "home": True}
    leg.update(kw)
    return leg


def ryanair_legs(a2c):
    legs = []
    for p in sorted(glob.glob(str(RAW / "ryanair-*.json"))):
        captured = time.strftime("%Y-%m-%d", time.localtime(os.path.getmtime(p)))
        for f in load_json(p, []):
            o = f.get("outbound") or {}
            dep, arr = (o.get("departureAirport") or {}).get("iataCode"), (o.get("arrivalAirport") or {}).get("iataCode")
            price = o.get("price") or {}
            eur = to_eur(price.get("value"), price.get("currencyCode"))
            if not dep or arr not in HOME_AIRPORTS or eur is None or not a2c.get(dep):
                continue
            dep_dt, arr_dt = o.get("departureDate", ""), o.get("arrivalDate", "")
            date = dep_dt[:10]
            legs.append(base(f"ry-{dep}-{arr}-{date}", dep, a2c[dep], arr, date, "Ryanair", eur, "ryanair-api",
                             f"https://www.ryanair.com/gb/en/trip/flights/select?adults=1&teens=0&children=0&infants=0&dateOut={date}"
                             f"&originIata={dep}&destinationIata={arr}&isReturn=false&discount=0&promoCode=&isConnectedFlight=false",
                             durationMin=minutes_between(dep_dt, arr_dt), depTime=dep_dt[11:16], arrTime=arr_dt[11:16],
                             priceOriginal=price.get("value"), currencyOriginal=price.get("currencyCode"),
                             includes=["small cabin bag"], missing=["10 kg cabin bag", "checked bag", "seat selection"], capturedAt=captured,
                             notes=f"departs {dep_dt[11:16]}, arrives {arr_dt[11:16]}; cheapest fare that day"))
    return legs


def wizz_legs(a2c):
    legs = []
    for p in sorted(glob.glob(str(RAW / "wizz-*.json"))):
        captured = time.strftime("%Y-%m-%d", time.localtime(os.path.getmtime(p)))
        frm, to = os.path.basename(p)[5:-5].split("-")
        if not a2c.get(frm):
            continue
        for f in (load_json(p, {}) or {}).get("outboundFlights", []):
            price = f.get("price") or {}
            eur = to_eur(price.get("amount"), price.get("currencyCode"))
            times = f.get("departureDates") or [f.get("departureDate")]
            date = (times[0] or "")[:10]
            if not eur or not date:
                continue
            legs.append(base(f"wz-{frm}-{to}-{date}", frm, a2c[frm], to, date, "Wizz Air", eur, "wizz-api",
                             f"https://wizzair.com/en-gb/booking/select-flight/{frm}/{to}/{date}/null/1/0/0/null",
                             depTime=(times[0] or "")[11:16] or None, priceOriginal=price.get("amount"), currencyOriginal=price.get("currencyCode"),
                             includes=["small personal item"], missing=["cabin trolley", "checked bag", "seat selection"], capturedAt=captured,
                             notes="lowest regular fare that day from the Wizz Air timetable"))
    return legs


def sas_legs(a2c):
    """raw/homes/sas-*.json: {FROM-TO-YYYYMMDD: {s, c, n, o: [[light, standard, dep, arr 'MM-DDTHH:MM', minutes, stops, via
    'CPH:65/OSL:90', flights, operating carriers, seats, light missing]]}}, from scripts/sas_home_run.js."""
    legs, seen = [], {}
    for p in sorted(glob.glob(str(RAW / "sas-[0-9]*.json"))):
        captured = time.strftime("%Y-%m-%d", time.localtime(os.path.getmtime(p)))
        for key, rec in (load_json(p, {}) or {}).items():
            seen[key] = (rec, captured)
    for key, (rec, captured) in seen.items():
        frm, to, d = key.split("-")
        date = f"{d[:4]}-{d[4:6]}-{d[6:]}"
        if not a2c.get(frm) or to not in HOME_AIRPORTS:
            continue
        cur = (rec.get("c") or "NOK").upper()
        for i, o in enumerate(rec.get("o") or []):
            light, std, dep, arr, mins, stops, via, flights, ops, seats, no_light = (list(o) + [None] * 11)[:11]
            eur = to_eur(light, cur)
            if not eur:
                continue
            vias = [v.split(":") for v in (via or "").split("/") if v]
            fam = "SAS Standard" if no_light else "SAS Light"
            delta = (std - light) if std and light and not no_light else None
            arr_date = f"{date[:4]}-{arr[:5]}" if arr else None
            legs.append(base(f"sas-ow-{frm}-{to}-{d}-{(dep or '').replace(':', '')}", frm, a2c[frm], to, date, "SAS", eur, "sas",
                             f"https://www.flysas.com/no-en/book/flights?search=OW_{frm}-{to}-{d}_a1c0i0y0&view=upsell&bookingFlow=revenue",
                             stops=stops, via=[v[0] for v in vias], durationMin=mins, layoverMin=max([int(v[1]) for v in vias if len(v) > 1 and v[1].isdigit()] or [0]),
                             overnight=bool(arr_date and arr_date != date and (mins or 0) >= 240), depTime=dep, arrTime=arr[6:] if arr else None,
                             arrDate=arr_date, priceOriginal=light, currencyOriginal=cur, fareFamily=fam,
                             includes=["1 underseat bag (40x30x15 cm)"] + (["carry-on bag (8 kg)", "checked bag"] if no_light else []),
                             missing=[] if no_light else ["carry-on bag (8 kg)", "checked bag"], capturedAt=captured, searchGroup="sas",
                             operatedBy=ops if ops and ops != "SK" else None,
                             notes=f"one-way {light} {cur} ({fam}): {flights} {dep}-{arr[6:] if arr else '?'}"
                                   + (f" [{len(vias)} stop{'s' if len(vias) != 1 else ''} via {'/'.join(v[0] for v in vias)}]" if vias else " [nonstop]")
                                   + (f", seats left at price: {seats}" if seats else "")
                                   + (f". Standard fare (adds 8 kg cabin bag + 23 kg checked bag) on the same flight: +{delta} NOK." if delta else "")))
    return legs


def google_legs(a2c):
    legs = []
    for p in sorted(glob.glob(str(SET / "raw" / "google" / "home-*.json"))):
        _, city, home, date = os.path.basename(p)[:-5].split("-", 3)
        rec = load_json(p)
        if not rec or home not in HOME_AIRPORTS:
            continue
        q = {"key": os.path.basename(p)[:-5], "kind": "back", "city": city, "legs": [(date, city, home)], "group": "all", "codes": []}
        for leg in gf.to_legs(q, rec, GOOGLE_CODE.get(city, city)):
            leg["id"] = leg["id"].replace("gfx-back-", f"gfx-home-{home}-", 1)
            leg["to"] = leg["toCity"] = home
            leg["home"] = True
            legs.append(leg)
    return legs


def build():
    a2c = airport_to_city()
    legs, seen = [], set()
    for part in (ryanair_legs(a2c), wizz_legs(a2c), sas_legs(a2c), google_legs(a2c)):
        for leg in part:
            if leg["id"] not in seen:
                seen.add(leg["id"])
                legs.append(leg)
    save_json(SET / "legs" / "homes.json", legs)
    by = {}
    for leg in legs:
        by[(leg["source"], leg["toCity"])] = by.get((leg["source"], leg["toCity"]), 0) + 1
    print(f"legs/homes.json: {len(legs)} legs; " + ", ".join(f"{s} to {h}: {n}" for (s, h), n in sorted(by.items())))


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--pairs" in args:
        pairs()
    if "--fetch" in args:
        fetch()
    if "--queue" in args:
        queue()
    build()
