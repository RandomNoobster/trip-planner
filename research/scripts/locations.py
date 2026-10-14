"""Where stays and airports are, so the app can say how central a stay is and draw airport transfers on the map.
- Hostelworld stays: latitude and longitude from Hostelworld's public property API (Airbnb search results already carry
  coordinates). Writes 2026-12-europe/stays/locations-hostelworld.json, cached per property.
- Airports: coordinates from the OurAirports open data set (public domain). Writes 2026-12-europe/airports-geo.json.
Run: py -3 -X utf8 -I research/scripts/locations.py"""
import csv
import glob
import io
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SET, UA, get, load_json, save_json  # noqa: E402

HW_API = "https://prod.apigee.hostelworld.com/legacy-hwapi-service/2.2/properties/{}/"
OURAIRPORTS = "https://davidmegginson.github.io/ourairports-data/airports.csv"


def fetch(url, timeout=45):
    """urllib first; Hostelworld has refused Python's TLS before, so fall back to curl."""
    status, body = get(url, timeout=timeout, retries=2, sleep=0.35)
    if status == 200:
        return body
    try:
        out = subprocess.run(["curl", "-s", "-m", str(timeout), "-A", UA, url], capture_output=True, timeout=timeout + 5)
        return out.stdout if out.returncode == 0 and out.stdout else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def hostel_locations():
    path = SET / "stays" / "locations-hostelworld.json"
    known = load_json(path, {}) or {}
    ids = set()
    for p in glob.glob(str(SET / "stays" / "hostelworld-*.json")):
        for s in load_json(p, []) or []:
            m = re.search(r"hostelworld-(\d+)$", s.get("id", "")) or re.search(r"/p/(\d+)/", s.get("url") or "")
            if m:
                ids.add(m.group(1))
    todo = sorted(i for i in ids if i not in known)
    print(f"hostelworld properties: {len(ids)}, to fetch: {len(todo)}")
    for n, pid in enumerate(todo, 1):
        body = fetch(HW_API.format(pid))
        try:
            d = json.loads(body) if body else {}
        except ValueError:
            d = {}
        lat, lon = d.get("latitude"), d.get("longitude")
        known[pid] = {"lat": round(float(lat), 5), "lon": round(float(lon), 5), "address": ", ".join(x for x in (d.get("address1"), d.get("address2")) if x) or None} if lat and lon else None
        if n % 25 == 0:
            save_json(path, known)
            print(f"  {n}/{len(todo)}")
    save_json(path, known)
    print("located:", sum(1 for v in known.values() if v), "of", len(known))


def airport_locations():
    codes = {"TRD"}
    for d in load_json(SET / "seed-destinations.json"):
        codes.update(d["airports"])
    for d in load_json(SET / "destinations.json", []) or []:
        codes.update(a["code"] for a in d.get("airports", []) if isinstance(a, dict))
    cache = SET / "raw" / "ourairports.csv"
    if not cache.exists():
        status, body = get(OURAIRPORTS, timeout=120)
        if status != 200:
            raise SystemExit(f"OurAirports download failed: HTTP {status}")
        cache.write_bytes(body)
    out = {}
    for row in csv.DictReader(io.StringIO(cache.read_text(encoding="utf-8"))):
        code = row.get("iata_code")
        if code in codes and row.get("type") in ("large_airport", "medium_airport", "small_airport"):
            out[code] = {"lat": round(float(row["latitude_deg"]), 4), "lon": round(float(row["longitude_deg"]), 4), "name": row["name"]}
    save_json(SET / "airports-geo.json", out)
    print("airports located:", len(out), "of", len(codes), "missing:", sorted(codes - set(out)))


if __name__ == "__main__":
    airport_locations()
    hostel_locations()
