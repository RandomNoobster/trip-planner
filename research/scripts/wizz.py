"""Wizz Air timetable fares for every Wizz route touching Trondheim, both directions, December 2026.
Writes raw/wizz/*.json and legs/wizz.json. Run: py -3 -u -X utf8 -I research/scripts/wizz.py"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SET, CAPTURED, UA, save_json, to_eur, airport_to_city  # noqa: E402

ORIGIN = "TRD"


def api_base():
    try:
        with urllib.request.urlopen(urllib.request.Request("https://wizzair.com/buildnumber", headers={"User-Agent": UA}), timeout=30) as r:
            body = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
    m = re.search(r"(https://be\.wizzair\.com/[\d.]+)", body)
    return m.group(1) if m else None


def call(api, path, payload=None):
    headers = {"User-Agent": UA, "Origin": "https://wizzair.com", "Referer": "https://wizzair.com/", "Content-Type": "application/json"}
    data = json.dumps(payload).encode() if payload is not None else None
    with urllib.request.urlopen(urllib.request.Request(api + path, data=data, headers=headers, method="POST" if data else "GET"), timeout=45) as r:
        return json.loads(r.read())


def main():
    api = api_base()
    if not api:
        print("could not find the Wizz Air API base")
        return
    stations = call(api, "/Api/asset/map?languageCode=en-gb").get("cities", [])
    trd = next((s for s in stations if s.get("iata") == ORIGIN), None)
    dests = [c["iata"] for c in (trd or {}).get("connections", [])]
    print("Wizz routes from TRD:", dests)
    a2c = airport_to_city()
    legs = []
    for d in dests:
        for frm, to in ((ORIGIN, d), (d, ORIGIN)):
            j = call(api, "/Api/search/timetable", {"flightList": [{"departureStation": frm, "arrivalStation": to, "from": "2026-11-28", "to": "2026-12-31"}],
                                                     "priceType": "regular", "adultCount": 1, "childCount": 0, "infantCount": 0})
            save_json(SET / "raw" / "wizz" / f"{frm}-{to}.json", j)
            for f in j.get("outboundFlights", []):
                price = f.get("price") or {}
                eur = to_eur(price.get("amount"), price.get("currencyCode"))
                if not eur:
                    continue
                times = f.get("departureDates") or [f.get("departureDate")]
                date = (times[0] or "")[:10]
                legs.append({
                    "id": f"wz-{frm}-{to}-{date}", "kind": "flight", "from": frm, "to": to,
                    "fromCity": a2c.get(frm, frm), "toCity": a2c.get(to, to), "date": date, "returnDate": None, "roundTrip": False,
                    "operator": "Wizz Air", "stops": 0, "via": [], "durationMin": None, "durationBackMin": None, "layoverMin": 0,
                    "overnight": False, "depTime": (times[0] or "")[11:16] or None, "priceEUR": eur, "priceMaxEUR": None,
                    "priceOriginal": price.get("amount"), "currencyOriginal": price.get("currencyCode"), "fareType": "adult",
                    "url": f"https://wizzair.com/en-gb/booking/select-flight/{frm}/{to}/{date}/null/1/0/0/null",
                    "source": "wizz-api", "includes": ["small personal item"], "missing": ["cabin trolley", "checked bag", "seat selection"],
                    "capturedAt": CAPTURED, "notes": "lowest regular fare that day from the Wizz Air timetable",
                })
            print(f"  {frm}-{to}: {len(j.get('outboundFlights', []))} days with fares")
    save_json(SET / "legs" / "wizz.json", legs)
    print(f"done: {len(legs)} Wizz legs")


if __name__ == "__main__":
    main()
