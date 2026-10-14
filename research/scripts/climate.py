"""Typical weather through the whole year for every city in places/cities.json, independent of any research set.
Daily ERA5 reanalysis from the Open-Meteo archive API (free, no key), summarised per half month (the 1st-15th and
the 16th-end of each month), so the app can look up any travel window. Raw answers are cached per city and year in
places/raw/open-meteo/, so reruns cost nothing and more years can be added later with --years.
Open-Meteo's free tier allows about 600 weighted calls a minute, 5,000 an hour and 10,000 a day, and one city-year
weighs about 26, so the script paces itself: a first run of four years for 80 cities takes a bit over an hour.
December windows cached by older research sets (raw/weather/<year>.json, Dec 4-18) are added as extra samples.
Run: py -3 -X utf8 -I -u research/scripts/climate.py [--years 2022-2025] [--no-fetch]"""
import argparse
import calendar
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT, get, load_json, save_json  # noqa: E402

PLACES = ROOT / "places"
RAW = PLACES / "raw" / "open-meteo"
API = "https://archive-api.open-meteo.com/v1/archive"
DAILY = ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "snowfall_sum", "sunshine_duration",
         "daylight_duration", "wind_speed_10m_max"]
PER_MINUTE, PER_HOUR = 520, 4700  # weighted calls, under the free limits
WIKI = "https://en.wikipedia.org/w/api.php"
WIKI_UA = {"User-Agent": "TripFinderResearch/1.0 (https://trip-finder-europe.netlify.app; personal trip planner) python-urllib/3"}
WIKI_TITLES = {"MLA": "Valletta", "LPA": "Las Palmas", "FNC": "Funchal", "PMI": "Palma de Mallorca", "TCI": "Tenerife",
               "REK": "Reykjavík", "STO": "Stockholm", "BUH": "Bucharest", "ROM": "Rome", "MIL": "Milan", "LON": "London",
               "PAR": "Paris", "GOT": "Gothenburg", "NAP": "Naples", "TRN": "Turin"}
PERIODS = [(m, half) for m in range(1, 13) for half in (0, 1)]  # half 0 = 1st-15th, 1 = 16th-end
spent = deque()  # (time, weight) of recent requests


def period_of(date):
    return (int(date[5:7]) - 1) * 2 + (0 if int(date[8:10]) <= 15 else 1)


def pace(weight):
    while True:
        now = time.time()
        while spent and now - spent[0][0] > 3600:
            spent.popleft()
        minute = sum(w for t, w in spent if now - t < 60)
        hour = sum(w for _, w in spent)
        if minute + weight <= PER_MINUTE and hour + weight <= PER_HOUR:
            spent.append((now, weight))
            return
        wait = 5 if hour + weight <= PER_HOUR else 60
        time.sleep(wait)


def fetch(city, year):
    path = RAW / f"{city['code']}-{year}.json"
    if path.exists():
        return load_json(path)
    days = 366 if calendar.isleap(year) else 365
    params = {"latitude": city["lat"], "longitude": city["lon"], "start_date": f"{year}-01-01", "end_date": f"{year}-12-31",
              "daily": ",".join(DAILY), "timezone": "auto"}
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(12):
        pace(days / 14)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=WIKI_UA), timeout=90) as r:
                data = json.loads(r.read())
            save_json(path, data["daily"])
            return data["daily"]
        except urllib.error.HTTPError as e:
            reason = e.read().decode("utf-8", "replace")
            if e.code != 429:
                raise SystemExit(f"Open-Meteo {city['code']} {year}: HTTP {e.code} {reason[:200]}")
            if "Daily" in reason:
                raise SystemExit("Open-Meteo daily limit reached; run again tomorrow, the cache keeps what was fetched")
            wait = 600 if "Hourly" in reason else 65
            print(f"  429 ({reason[:60]}), waiting {wait} s", flush=True)
            time.sleep(wait)
        except Exception as e:  # noqa: BLE001
            print(f"  {city['code']} {year}: {e}, retrying", flush=True)
            time.sleep(10)
    raise SystemExit(f"gave up on {city['code']} {year}")


def legacy_december():
    """Dec 4-18 samples that older research sets cached for all their cities in one request per year."""
    out = {}
    for folder in ROOT.iterdir():
        seed = folder / "seed-destinations.json"
        if not (folder / "raw" / "weather").exists() or not seed.exists():
            continue
        codes = [d["code"] for d in load_json(seed)]
        for f in sorted((folder / "raw" / "weather").glob("*.json")):
            for code, res in zip(codes, load_json(f)):
                out.setdefault(code, {})[int(f.stem)] = res["daily"]
    return out


def summarize(days):
    hi = [d["temperature_2m_max"] for d in days if d["temperature_2m_max"] is not None]
    lo = [d["temperature_2m_min"] for d in days if d["temperature_2m_min"] is not None]
    if len(hi) < 10:
        return None
    pr = [d["precipitation_sum"] or 0 for d in days]
    sn = [d["snowfall_sum"] or 0 for d in days]
    wind = [d["wind_speed_10m_max"] for d in days if d["wind_speed_10m_max"] is not None]
    q = statistics.quantiles(hi, n=10)
    return {
        "highC": round(statistics.mean(hi), 1), "lowC": round(statistics.mean(lo), 1),
        "highP10": round(q[0], 1), "highP90": round(q[-1], 1),
        "wetShare": round(sum(1 for p in pr if p >= 1.0) / len(pr), 2), "precipMm": round(statistics.mean(pr), 1),
        "snowShare": round(sum(1 for s in sn if s >= 1.0) / len(sn), 2),
        "frostShare": round(sum(1 for t in lo if t < 0) / len(lo), 2),
        "sunH": round(statistics.mean((d["sunshine_duration"] or 0) / 3600 for d in days), 1),
        "daylightH": round(statistics.mean((d["daylight_duration"] or 0) / 3600 for d in days), 1),
        "windKmh": round(statistics.mean(wind)) if wind else None, "days": len(days),
    }


def climate_link(code, name, cache):
    if code in cache:
        return cache[code]
    title = WIKI_TITLES.get(code) or name.split(",")[0].split(" (")[0]
    q = urllib.parse.urlencode({"action": "parse", "page": title, "prop": "sections", "format": "json", "redirects": 1})
    status, body = get(f"{WIKI}?{q}", headers=WIKI_UA, sleep=0.3)
    link = None
    if status == 200:
        parse = json.loads(body).get("parse") or {}
        sections = [s for s in parse.get("sections", []) if "climate" in s.get("line", "").lower()]
        sections.sort(key=lambda s: s.get("line", "").strip().lower() != "climate")
        if sections:
            page = parse.get("title", title).replace(" ", "_")
            link = {"url": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(page)}#{sections[0]['anchor']}",
                    "label": "Monthly climate table (Wikipedia)"}
    cache[code] = link
    return link


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", default="2022-2025", help="first-last calendar years to average")
    ap.add_argument("--no-fetch", action="store_true", help="summarise what is cached")
    args = ap.parse_args()
    first, last = (int(y) for y in args.years.split("-"))
    years = list(range(last, first - 1, -1))  # newest first, so an interrupted run still has whole years
    cities = [c for c in load_json(PLACES / "cities.json") if not c.get("home")]
    if not args.no_fetch:
        todo = [(c, y) for y in years for c in cities if not (RAW / f"{c['code']}-{y}.json").exists()]
        print(f"{len(todo)} city-years to fetch, about {round(len(todo) * 26 / PER_HOUR * 60)} min at the hourly limit", flush=True)
        for i, (c, y) in enumerate(todo, 1):
            fetch(c, y)
            if i % 20 == 0 or i == len(todo):
                print(f"  {i}/{len(todo)} fetched ({c['code']} {y})", flush=True)
    legacy = legacy_december()
    links = load_json(PLACES / "raw" / "wiki-climate-links.json", {})
    out = {}
    for c in cities:
        buckets = [[] for _ in PERIODS]
        got = []
        cached = sorted({int(f.stem.rsplit("-", 1)[1]) for f in RAW.glob(f"{c['code']}-*.json")}, reverse=True)
        for y in cached:  # every cached year, not only the ones fetched this run
            daily = load_json(RAW / f"{c['code']}-{y}.json")
            if not daily:
                continue
            got.append(y)
            for i, date in enumerate(daily["time"]):
                buckets[period_of(date)].append({k: daily[k][i] for k in DAILY})
        extra = sorted(y for y in legacy.get(c["code"], {}) if y not in got)
        for y in extra:
            daily = legacy[c["code"]][y]
            for i, date in enumerate(daily["time"]):
                buckets[period_of(date)].append({k: daily[k][i] for k in DAILY})
        if not got and not extra:
            continue
        out[c["code"]] = {"years": sorted(got), "decemberYears": sorted(set(got) | set(extra)),
                          "periods": [summarize(b) for b in buckets], "link": climate_link(c["code"], c["name"], links)}
    save_json(PLACES / "raw" / "wiki-climate-links.json", links)
    all_years = sorted({y for v in out.values() for y in v["years"]})
    span = f"{min(all_years)}–{max(all_years)}" if all_years else ""
    save_json(PLACES / "climate.json", {
        "source": "Open-Meteo historical weather API (ERA5 reanalysis)", "sourceUrl": "https://open-meteo.com/en/docs/historical-weather-api",
        "years": span, "generated": time.strftime("%Y-%m-%d"),
        "note": "Averages of the same half month over the years fetched; December also uses the Dec 4-18 windows cached by research sets.",
        "periods": [{"month": m, "from": 1 if h == 0 else 16, "to": 15 if h == 0 else calendar.monthrange(2025, m)[1]} for m, h in PERIODS],
        "cities": out})
    full = sum(1 for v in out.values() if len(v["years"]) == len(all_years))
    print(f"climate for {len(out)} cities ({full} with all {len(all_years)} years {span}); links {sum(1 for v in out.values() if v['link'])}")


if __name__ == "__main__":
    main()
