"""Import results read from Google Flights pages in the browser (raw/google-ui/results-*.json, compact arrays from
gf_ui_extract.js stored as localStorage '__gfx') into raw/google/<key>.json, the format google_flights.py builds legs from.
Then rebuild legs without fetching: py -3 -X utf8 -I research/scripts/google_flights.py --no-fetch
Run: py -3 -X utf8 -I research/scripts/google_ui_import.py"""
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SET, load_json, save_json  # noqa: E402

UI = SET / "raw" / "google-ui"
RAW = SET / "raw" / "google"


def to_dict(a):
    (price, rt, no_bin, stops, airlines, dep_t, dep_d, arr_t, arr_d, dur, dep_name, arr_name, lays, sep, chg) = (list(a) + [None] * 15)[:15]
    layovers = []
    for part in (lays or "").split(";"):
        if not part:
            continue
        m, airport, city, overnight = (part.split("|") + ["", "", "", "0"])[:4]
        layovers.append({"min": int(m or 0), "airport": airport, "city": city or None, "overnight": overnight == "1"})
    return {"price": float(price), "roundTripTotal": bool(rt), "noOverheadBin": bool(no_bin), "stops": stops, "airlines": airlines,
            "operatedBy": None, "depAirportName": dep_name, "depTime": dep_t, "depDate": dep_d, "arrAirportName": arr_name,
            "arrTime": arr_t, "arrDate": arr_d, "durationMin": dur, "layovers": layovers, "separateTickets": bool(sep), "changeAirport": bool(chg)}


def main():
    urls = {}
    for q in glob.glob(str(UI / "queue*.json")):
        for item in load_json(q, []) or []:
            urls[item["key"]] = item["url"]
    imported = skipped = 0
    for path in sorted(glob.glob(str(UI / "results-*.json"))):
        for rec in load_json(path, []) or []:
            key, r = rec.get("key"), rec.get("r")
            if not key or not isinstance(r, list) or len(r) < 3:
                skipped += 1
                continue
            done, _count, its = r[0], r[1], r[2]
            if not done and not its:  # the page never finished loading: leave it missing so it is retried
                skipped += 1
                continue
            save_json(RAW / f"{key}.json", {"url": urls.get(key), "via": "ui", "itineraries": [to_dict(a) for a in its if a and a[0]]})
            imported += 1
    print(f"imported {imported} searches, skipped {skipped}")


if __name__ == "__main__":
    main()
