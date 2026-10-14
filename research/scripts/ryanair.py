"""Ryanair fare finder: cheapest one-way fare per destination per day, for every airport in the seed list.
Writes raw/ryanair/<AIRPORT>.json and legs/ryanair.json. Run: py -3 -X utf8 -I research/scripts/ryanair.py"""
import json
import sys
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SET, CAPTURED, get, save_json, seed, airport_to_city, to_eur, minutes_between

WINDOWS = [("2026-12-04", "2026-12-11"), ("2026-12-12", "2026-12-19")]
URL = ("https://www.ryanair.com/api/farfnd/v4/oneWayFares?departureAirportIataCode={a}"
       "&outboundDepartureDateFrom={d1}&outboundDepartureDateTo={d2}&market=en-gb&adultPaxCount=1"
       "&searchMode=ALL&language=en&limit=5000&offset=0")


def main():
    a2c = airport_to_city()
    airports = sorted({a for d in seed() for a in d["airports"]})
    legs = []
    served = []
    for ap in airports:
        fares_all = []
        for d1, d2 in WINDOWS:
            status, body = get(URL.format(a=ap, d1=d1, d2=d2))
            if status != 200 or not body:
                print(f"{ap} {d1}: status {status}", file=sys.stderr)
                continue
            try:
                fares_all.extend(json.loads(body).get("fares", []))
            except json.JSONDecodeError:
                print(f"{ap} {d1}: bad json", file=sys.stderr)
        if not fares_all:
            print(f"{ap}: no Ryanair fares")
            continue
        served.append(ap)
        save_json(SET / "raw" / "ryanair" / f"{ap}.json", fares_all)
        kept = 0
        for f in fares_all:
            o = f.get("outbound") or {}
            dep = (o.get("departureAirport") or {}).get("iataCode")
            arr = (o.get("arrivalAirport") or {}).get("iataCode")
            if not dep or not arr or arr not in a2c:
                continue
            price = (o.get("price") or {})
            eur = to_eur(price.get("value"), price.get("currencyCode"))
            if eur is None:
                continue
            dep_dt = o.get("departureDate", "")
            arr_dt = o.get("arrivalDate", "")
            date = dep_dt[:10]
            try:
                dur = minutes_between(dep_dt, arr_dt)
            except Exception:  # noqa: BLE001
                dur = None
            legs.append({
                "id": f"ry-{dep}-{arr}-{date}",
                "kind": "flight", "from": dep, "to": arr, "fromCity": a2c.get(dep), "toCity": a2c[arr],
                "date": date, "returnDate": None, "roundTrip": False,
                "operator": "Ryanair", "stops": 0, "via": [], "durationMin": dur, "durationBackMin": None,
                "layoverMin": 0, "overnight": False,
                "priceEUR": eur, "priceMaxEUR": None, "priceOriginal": price.get("value"), "currencyOriginal": price.get("currencyCode"),
                "url": (f"https://www.ryanair.com/gb/en/trip/flights/select?adults=1&teens=0&children=0&infants=0&dateOut={date}"
                        f"&originIata={dep}&destinationIata={arr}&isReturn=false&discount=0&promoCode=&isConnectedFlight=false"),
                "source": "ryanair-api", "includes": ["small cabin bag"], "missing": ["10 kg cabin bag", "checked bag", "seat selection"],
                "capturedAt": CAPTURED, "notes": f"departs {dep_dt[11:16]}, arrives {arr_dt[11:16]}; cheapest fare that day"
            })
            kept += 1
        print(f"{ap}: {len(fares_all)} fares, {kept} to seed airports")
    save_json(SET / "legs" / "ryanair.json", legs)
    print(f"served airports: {len(served)}; legs saved: {len(legs)}")


if __name__ == "__main__":
    main()
