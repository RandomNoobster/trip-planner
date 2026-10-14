"""Shared helpers for the research scrapers. Run every script with: py -3 -X utf8 -I <script>."""
import json
import math
import pathlib
import time
import urllib.request
import urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1]
SET = ROOT / "2026-12-europe"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
CAPTURED = time.strftime("%Y-%m-%d")


def load_json(path, default=None):
    p = pathlib.Path(path)
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding="utf-8"))


def save_json(path, data):
    p = pathlib.Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def seed():
    return load_json(SET / "seed-destinations.json")


def airport_to_city():
    m = {}
    for d in seed():
        for a in d["airports"]:
            m.setdefault(a, d["code"])
    return m


def fx():
    return load_json(SET / "fx.json")["rates"]


def to_eur(value, currency):
    rates = fx()
    currency = (currency or "EUR").upper()
    if currency == "EUR":
        return round(float(value), 2)
    if currency not in rates:
        return None
    return round(float(value) / rates[currency], 2)


def get(url, headers=None, timeout=45, retries=3, sleep=0.4):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9", "Accept": "*/*", **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
            time.sleep(sleep)
            return r.status, body
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 503):
                time.sleep(3 * (attempt + 1))
                continue
            return e.code, b""
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    return 0, (str(last) or "").encode()


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def minutes_between(a_iso, b_iso):
    """Minutes between two naive ISO datetimes 'YYYY-MM-DDTHH:MM:SS' (same tz assumed)."""
    from datetime import datetime
    fmt = "%Y-%m-%dT%H:%M:%S"
    a = datetime.strptime(a_iso[:19], fmt)
    b = datetime.strptime(b_iso[:19], fmt)
    return int((b - a).total_seconds() // 60)
