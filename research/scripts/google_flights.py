"""Google Flights sweep: Trondheim (TRD) to every seed city and back, unfiltered and per airline group.

Fetches the server-rendered results page (consent cookie, gzip) and parses the itinerary aria-labels,
which carry price, airlines, times, duration, layovers and the "no overhead bin" note.
SAS withholds its fares from Google ("Price unavailable"), so SAS is captured separately in the browser.

Writes raw/google/<key>.json per query (resumable) and legs/google-sweep.json.
Run: py -3 -u -X utf8 -I research/scripts/google_flights.py [--only CODE,CODE] [--workers 3]
"""
import base64
import concurrent.futures as cf
import gzip
import html as H
import json
import os
import random
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SET, CAPTURED, UA, save_json, load_json, seed  # noqa: E402

ORIGIN = "TRD"
SOCS = "SOCS=CAESHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmVuIAEaBgiAo_CmBg; CONSENT=PENDING+987"
BASE = "https://www.google.com/travel/flights?hl=en&curr=EUR&gl=NO&tfs="
RAW = SET / "raw" / "google"
PACE = [0.25, 0.7]  # seconds between requests per worker; --slow raises it

GROUPS = {
    "all": [],
    "norwegian": ["DY", "D8"],
    "klm-airfrance": ["KL", "AF"],
    "lufthansa-group": ["LH", "LX", "OS", "SN", "EW", "4Y", "WF"],
    "finnair": ["AY", "WF"],
}
RT_PAIRS_ALL = [("2026-12-05", "2026-12-13"), ("2026-12-06", "2026-12-14"), ("2026-12-07", "2026-12-15"),
                ("2026-12-08", "2026-12-16"), ("2026-12-09", "2026-12-17"), ("2026-12-07", "2026-12-14"), ("2026-12-08", "2026-12-17")]
OUT_DATES_ALL = ["2026-12-05", "2026-12-06", "2026-12-07", "2026-12-08", "2026-12-09"]
BACK_DATES_ALL = ["2026-12-13", "2026-12-14", "2026-12-15", "2026-12-16", "2026-12-17"]
RT_PAIRS_GROUP = [("2026-12-07", "2026-12-15")]
OUT_DATES_GROUP = ["2026-12-07"]
BACK_DATES_GROUP = ["2026-12-15"]

AIRPORT_HINTS = [
    ("heathrow", "LHR"), ("gatwick", "LGW"), ("stansted", "STN"), ("luton", "LTN"), ("london city", "LCY"), ("southend", "SEN"),
    ("charles de gaulle", "CDG"), ("orly", "ORY"), ("beauvais", "BVA"), ("malpensa", "MXP"), ("linate", "LIN"), ("bergamo", "BGY"),
    ("orio al serio", "BGY"), ("fiumicino", "FCO"), ("leonardo da vinci", "FCO"), ("ciampino", "CIA"), ("arlanda", "ARN"),
    ("bromma", "BMA"), ("skavsta", "NYO"), ("henri coand", "OTP"), ("otopeni", "OTP"), ("keflav", "KEF"), ("tenerife south", "TFS"),
    ("tenerife sur", "TFS"), ("tenerife north", "TFN"), ("tenerife norte", "TFN"), ("sabiha", "SAW"), ("istanbul airport", "IST"),
    ("treviso", "TSF"), ("marco polo", "VCE"), ("pisa", "PSA"), ("charleroi", "CRL"), ("brussels airport", "BRU"), ("eindhoven", "EIN"),
    ("rotterdam", "RTM"), ("schiphol", "AMS"), ("weeze", "NRN"), ("düsseldorf", "DUS"), ("dusseldorf", "DUS"), ("cologne", "CGN"),
    ("memmingen", "FMM"), ("hahn", "HHN"), ("katowice", "KTW"), ("modlin", "WMI"), ("chopin", "WAW"), ("kaunas", "KUN"),
    ("girona", "GRO"), ("reus", "REU"), ("prestwick", "PIK"), ("liverpool", "LPL"), ("paphos", "PFO"), ("larnaca", "LCA"),
    ("vienna", "VIE"), ("bratislava", "BTS"), ("gran canaria", "LPA"),
]

_lock = threading.Lock()
_pause_until = [0.0]
_blocked = [0]


def varint(n):
    out = b""
    while True:
        b = n & 0x7F
        n >>= 7
        out += bytes([b | (0x80 if n else 0)])
        if not n:
            return out


def field(num, wt, payload):
    key = varint((num << 3) | wt)
    return key + (varint(payload) if wt == 0 else varint(len(payload)) + payload)


def pstr(num, text):
    return field(num, 2, text.encode())


def tfs(legs, trip, airlines=()):
    body = b""
    for date, frm, to in legs:
        fd = pstr(2, date) + b"".join(pstr(6, a) for a in airlines) + field(13, 2, pstr(2, frm)) + field(14, 2, pstr(2, to))
        body += field(3, 2, fd)
    body += field(8, 0, 1) + field(9, 0, 1) + field(19, 0, trip)
    return base64.urlsafe_b64encode(body).decode().rstrip("=")


UI_BASE = "https://www.google.com/travel/flights/search?hl=en&curr=EUR&gl=NO&tfs="


def tfs_ui(legs, trip, airlines=()):
    """The link shape Google's own search page writes: a header (1=28, 2=2), airports typed as airports, field 14 and an
    open price cap. Since October 2026 a round trip in the short shape above only shows "Oops, something went wrong",
    so round-trip searches and the links the app shows for them use this one; one-ways work in either shape."""
    body = field(1, 0, 28) + field(2, 0, 2)
    for date, frm, to in legs:
        fd = (pstr(2, date) + b"".join(pstr(6, a) for a in airlines)
              + field(13, 2, field(1, 0, 1) + pstr(2, frm)) + field(14, 2, field(1, 0, 1) + pstr(2, to)))
        body += field(3, 2, fd)
    body += field(8, 0, 1) + field(9, 0, 1) + field(14, 0, 1) + field(16, 2, field(1, 0, 2**64 - 1)) + field(19, 0, trip)
    return base64.urlsafe_b64encode(body).decode().rstrip("=")


def search_url(q):
    return UI_BASE + tfs_ui(q["legs"], 1, q["codes"]) if q["trip"] == 1 else BASE + tfs(q["legs"], q["trip"], q["codes"])


def fetch(url):
    for attempt in range(4):
        wait = _pause_until[0] - time.time()
        if wait > 0:
            time.sleep(wait)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9", "Accept-Encoding": "gzip", "Cookie": SOCS})
            with urllib.request.urlopen(req, timeout=45) as r:
                raw = r.read()
                enc = r.headers.get("Content-Encoding")
            html = (gzip.decompress(raw) if enc == "gzip" else raw).decode("utf-8", "replace")
            if "unusual traffic" in html or 'id="captcha-form"' in html:
                raise urllib.error.HTTPError(url, 429, "captcha", None, None)
            time.sleep(random.uniform(PACE[0], PACE[1]))
            return html
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                with _lock:
                    _blocked[0] += 1
                    _pause_until[0] = max(_pause_until[0], time.time() + 120 * (attempt + 1))
                print(f"  throttled ({e.code}), pausing {120 * (attempt + 1)}s", flush=True)
                continue
            return None
        except Exception:  # noqa: BLE001
            time.sleep(2 * (attempt + 1))
    return None


def to_minutes(text):
    h = re.search(r"(\d+)\s*hr", text)
    m = re.search(r"(\d+)\s*min", text)
    return (int(h.group(1)) * 60 if h else 0) + (int(m.group(1)) if m else 0)


MONTHS = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], 1)}


def iso_date(text):
    m = re.search(r"(\w+) (\d{1,2})$", text.strip())
    if not m or m.group(1) not in MONTHS:
        return None
    month = MONTHS[m.group(1)]
    year = 2027 if month < 6 else 2026
    return f"{year}-{month:02d}-{int(m.group(2)):02d}"


def clock(text):
    m = re.match(r"(\d{1,2}):(\d\d)\s*([AP])M", text.replace(" ", " ").strip())
    if not m:
        return None
    h = int(m.group(1)) % 12 + (12 if m.group(3) == "P" else 0)
    return f"{h:02d}:{m.group(2)}"


def airport_code(name, fallback):
    n = (name or "").lower()
    for hint, code in AIRPORT_HINTS:
        if hint in n:
            return code
    return fallback


def parse_label(label):
    lab = label.replace(" ", " ").replace("\xa0", " ")
    m = re.search(r"From ([\d,]+) euros", lab)
    if not m:
        return None
    it = {"price": float(m.group(1).replace(",", "")), "roundTripTotal": "round trip total" in lab,
          "noOverheadBin": "does not include overhead bin access" in lab}
    m = re.search(r"(Nonstop|(\d+) stops?) flight with (.+?)\.(?: |$)", lab)
    it["stops"] = 0 if (m and m.group(1) == "Nonstop") else int(m.group(2)) if m else None
    it["airlines"] = m.group(3).strip() if m else None
    m = re.search(r"Operated by (.+?)\.(?: |$)", lab)
    it["operatedBy"] = m.group(1).strip() if m else None
    m = re.search(r"Leaves (.+?) at (\d{1,2}:\d\d ?[AP]M) on (\w+day, \w+ \d{1,2}) and arrives at (.+?) at (\d{1,2}:\d\d ?[AP]M) on (\w+day, \w+ \d{1,2})\.", lab)
    if m:
        it.update({"depAirportName": m.group(1), "depTime": clock(m.group(2)), "depDate": iso_date(m.group(3)),
                   "arrAirportName": m.group(4), "arrTime": clock(m.group(5)), "arrDate": iso_date(m.group(6))})
    m = re.search(r"Total duration ((?:\d+ hr ?)?(?:\d+ min)?)", lab)
    it["durationMin"] = to_minutes(m.group(1)) if m else None
    lays = []
    for lm in re.finditer(r"Layover \((\d) of (\d)\) is an? (.+?) (overnight )?layover at (.+?)(?: in (.+?))?\.(?: |$)", lab):
        lays.append({"min": to_minutes(lm.group(3)), "overnight": bool(lm.group(4)), "airport": lm.group(5), "city": lm.group(6)})
    it["layovers"] = lays
    it["changeAirport"] = "change airports" in lab.lower() or "requires changing airports" in lab.lower()
    it["separateTickets"] = "separate tickets" in lab.lower() or "self transfer" in lab.lower()
    return it


def labels(html):
    return list(dict.fromkeys(H.unescape(x) for x in re.findall(r'aria-label="(From [^"]*?flight with[^"]*)"', html)))


def shop(html):
    """When the page says "Loading results", replay its own embedded search through the GetShoppingResults endpoint."""
    sid = re.search(r'"FdrFJe":"([^"]+)"', html)
    bl = re.search(r'"cfb2h":"([^"]+)"', html)
    req = re.search(r"'ds:1' : \{id:'(\w+)',request:(.*?)\},'ds:2'", html)
    if not (sid and bl and req):
        return []
    ep = (f"https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetShoppingResults?f.sid={sid.group(1)}"
          f"&bl={urllib.parse.quote(bl.group(1))}&hl=en&gl=NO&curr=EUR&soc-app=162&soc-platform=1&soc-device=1&_reqid={random.randint(10000, 99999)}&rt=c")
    body = urllib.parse.urlencode({"f.req": json.dumps([None, req.group(2)], separators=(",", ":"))}).encode()
    for attempt in range(3):
        try:
            r = urllib.request.Request(ep, data=body, method="POST", headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                                                                               "Cookie": SOCS, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(r, timeout=60) as resp:
                raw = resp.read()
                enc = resp.headers.get("Content-Encoding")
            txt = (gzip.decompress(raw) if enc == "gzip" else raw).decode("utf-8", "replace")
            payloads, rpc_error = [], False
            for line in txt.splitlines():
                if line.startswith("[["):
                    for item in json.loads(line):
                        if item and item[0] == "wrb.fr" and isinstance(item[2], str):
                            payloads.append(json.loads(item[2]))
                        elif item and item[0] == "wrb.fr" and len(item) > 5 and item[5]:
                            rpc_error = True  # e.g. [13]: Google refuses the request; not the same as "no flights"
            time.sleep(random.uniform(PACE[0], PACE[1]))
            if rpc_error and not payloads:
                with _lock:
                    _blocked[0] += 1
                return None
            return payloads
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                with _lock:
                    _blocked[0] += 1
                    _pause_until[0] = max(_pause_until[0], time.time() + 60 * (attempt + 1))
            time.sleep(3 * (attempt + 1))
        except Exception:  # noqa: BLE001
            time.sleep(2 * (attempt + 1))
    return None


def join_names(names):
    names = [n for n in names if n]
    if len(names) <= 1:
        return names[0] if names else None
    return ", ".join(names[:-1]) + " and " + names[-1]


def hhmm(t):
    if not t:
        return None
    return f"{int(t[0]):02d}:{int(t[1]) if len(t) > 1 and t[1] is not None else 0:02d}"


def ymd(d):
    return f"{d[0]:04d}-{d[1]:02d}-{d[2]:02d}" if d and len(d) == 3 else None


def parse_offers(payloads, round_trip):
    """Turn GetShoppingResults offers into the same itinerary dicts parse_label produces (plus airport codes and flight numbers)."""
    its, seen = [], set()
    for d in payloads:
        offers = []
        for section in (d[2] if len(d) > 2 else None, d[3] if len(d) > 3 else None):
            if section and section[0]:
                offers.extend(section[0])
        for o in offers:
            try:
                f = o[0]
                price = o[1][0][1] if o[1] and o[1][0] and len(o[1][0]) > 1 else None
                if price is None:
                    continue
                segs = f[2] or []
                flights = [f"{s[22][0]}{s[22][1]}" for s in segs if len(s) > 22 and s[22]]
                key = (tuple(flights), price)
                if key in seen:
                    continue
                seen.add(key)
                lays = []
                for l in (f[13] or []):
                    lays.append({"min": l[0], "overnight": False, "airport": l[4], "city": l[5], "code": l[1],
                                 "changeAirport": bool(l[1] and l[2] and l[1] != l[2])})
                operated = sorted({s[2] for s in segs if s[2]})
                it = {
                    "price": float(price), "roundTripTotal": bool(round_trip),
                    "noOverheadBin": bool(o[5][0]) if len(o) > 5 and o[5] else False,
                    "stops": max(0, len(segs) - 1), "airlines": join_names(f[1] or []),
                    "operatedBy": ", ".join(operated) or None,
                    "depCode": f[3], "depAirportName": segs[0][4] if segs else None, "depTime": hhmm(f[5]), "depDate": ymd(f[4]),
                    "arrCode": f[6], "arrAirportName": segs[-1][5] if segs else None, "arrTime": hhmm(f[8]), "arrDate": ymd(f[7]),
                    "durationMin": f[9], "layovers": lays, "changeAirport": any(l["changeAirport"] for l in lays),
                    "separateTickets": False, "flights": flights, "via": "rpc",
                }
                for l in lays:
                    l["overnight"] = bool(it["depDate"] and it["arrDate"] and it["depDate"] != it["arrDate"] and l["min"] >= 240)
                its.append(it)
            except (IndexError, TypeError, KeyError):
                continue
    return its


def queries(dests):
    out = []
    for d in dests:
        c = d["code"]
        for g, codes in GROUPS.items():
            pairs = RT_PAIRS_ALL if g == "all" else RT_PAIRS_GROUP
            outs = OUT_DATES_ALL if g == "all" else OUT_DATES_GROUP
            backs = BACK_DATES_ALL if g == "all" else BACK_DATES_GROUP
            for d1, d2 in pairs:
                out.append({"key": f"rt-{c}-{d1}-{d2}-{g}", "trip": 1, "legs": [(d1, ORIGIN, c), (d2, c, ORIGIN)], "group": g, "codes": codes, "city": c, "kind": "rt"})
            for d1 in outs:
                out.append({"key": f"out-{c}-{d1}-{g}", "trip": 2, "legs": [(d1, ORIGIN, c)], "group": g, "codes": codes, "city": c, "kind": "out"})
            for d2 in backs:
                out.append({"key": f"back-{c}-{d2}-{g}", "trip": 2, "legs": [(d2, c, ORIGIN)], "group": g, "codes": codes, "city": c, "kind": "back"})
    return out


def run_query(q):
    path = RAW / f"{q['key']}.json"
    if path.exists():
        return q, load_json(path)
    url = BASE + tfs(q["legs"], q["trip"], q["codes"])
    html = fetch(url)
    if html is None:
        return q, None
    its = []
    for lab in labels(html):
        p = parse_label(lab)
        if p:
            p["label"] = lab
            its.append(p)
    via = "html"
    if not its and "Loading results" in html:
        payloads = shop(html)
        if payloads is None:
            return q, None  # refused: leave no file so a later run retries it
        its = parse_offers(payloads, q["trip"] == 1)
        via = "rpc"
    rec = {"url": url, "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "priceUnavailable": html.count("Price unavailable"), "via": via, "itineraries": its}
    save_json(path, rec)
    return q, rec


def to_legs(q, rec, dest_airport):
    its = [i for i in rec["itineraries"] if i.get("price")]
    if not its:
        return []
    cheapest = min(i["price"] for i in its)
    keep = {}
    for i in sorted(its, key=lambda x: (x["price"], x.get("durationMin") or 9999)):
        key = i.get("airlines") or "?"
        if key not in keep:
            keep[key] = i
    fastest = min(its, key=lambda x: x.get("durationMin") or 9999)
    if fastest["price"] <= cheapest * 1.25:
        keep.setdefault("__fastest__" + (fastest.get("airlines") or "?"), fastest)
    legs = []
    for tag, i in keep.items():
        city = q["city"]
        if q["kind"] == "back":
            frm, to, frm_city, to_city = i.get("depCode") or airport_code(i.get("depAirportName"), dest_airport), ORIGIN, city, ORIGIN
        else:
            frm, to, frm_city, to_city = ORIGIN, i.get("arrCode") or airport_code(i.get("arrAirportName"), dest_airport), ORIGIN, city
        layover_max = max([l["min"] for l in i["layovers"]] or [0])
        overnight = any(l["overnight"] for l in i["layovers"]) or (i.get("depDate") and i.get("arrDate") and i["depDate"] != i["arrDate"]) or (i.get("durationMin") or 0) >= 720
        missing = []
        if i["noOverheadBin"]:
            missing.append("overhead bin (cabin bag must fit under the seat)")
        missing.append("checked bag (most economy-light fares)")
        if i["separateTickets"]:
            missing.append("protected connection (separate tickets)")
        if i["changeAirport"]:
            missing.append("same-airport connection (you change airports)")
        airline_slug = re.sub(r"[^a-z0-9]+", "", (i.get("airlines") or "x").lower())[:24]
        date = q["legs"][0][0]
        legs.append({
            "id": f"gfx-{q['kind']}-{city}-{date}" + (f"-{q['legs'][1][0]}" if q["kind"] == "rt" else "") + f"-{airline_slug}-{(i.get('depTime') or '').replace(':', '')}",
            "kind": "flight", "from": frm, "to": to, "fromCity": frm_city, "toCity": to_city,
            "date": date, "returnDate": q["legs"][1][0] if q["kind"] == "rt" else None, "roundTrip": q["kind"] == "rt",
            "operator": i.get("airlines"), "operatedBy": i.get("operatedBy"), "stops": i.get("stops"),
            "via": [l.get("city") or l.get("airport") for l in i["layovers"]], "durationMin": i.get("durationMin"), "durationBackMin": None,
            "layoverMin": layover_max, "overnight": bool(overnight),
            "depTime": i.get("depTime"), "arrTime": i.get("arrTime"), "arrDate": i.get("arrDate"), "flights": i.get("flights"),
            "priceEUR": i["price"], "priceMaxEUR": None, "priceOriginal": i["price"], "currencyOriginal": "EUR",
            "fareType": "adult", "url": search_url(q) if q["kind"] == "rt" else rec["url"], "source": "google-flights", "searchGroup": q["group"],
            "includes": ["personal item"] + ([] if i["noOverheadBin"] else ["cabin bag (overhead bin)"]),
            "missing": missing, "capturedAt": CAPTURED,
            "notes": ("fastest within 25% of cheapest; " if tag.startswith("__fastest__") else "") +
                     ("round-trip total, outbound shown; " if q["kind"] == "rt" else "") +
                     ("; ".join(f"layover {round(l['min'] / 60, 1)} h at {l.get('airport')}" + (" overnight" if l["overnight"] else "") for l in i["layovers"]) or "nonstop"),
        })
    return legs


def main():
    args = sys.argv[1:]
    only = set()
    workers = 3
    if "--only" in args:
        only = set(args[args.index("--only") + 1].split(","))
    if "--workers" in args:
        workers = int(args[args.index("--workers") + 1])
    dests = [d for d in seed() if not only or d["code"] in only]
    dest_airport = {d["code"]: d["airports"][0] for d in seed()}
    qs = queries(dests)
    RAW.mkdir(parents=True, exist_ok=True)
    if "--slow" in args:
        PACE[0], PACE[1] = 1.2, 2.6
    todo = [] if "--no-fetch" in args else [q for q in qs if not (RAW / f"{q['key']}.json").exists()]
    todo.sort(key=lambda q: (q["group"] != "all", q["kind"] != "rt"))
    print(f"queries: {len(qs)} total, {len(todo)} to fetch, workers {workers}", flush=True)
    done, failed = 0, 0
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        for q, rec in ex.map(run_query, todo):
            done += 1
            if rec is None:
                failed += 1
            if done % 50 == 0:
                print(f"  {done}/{len(todo)} fetched, {failed} failed, throttle events {_blocked[0]}", flush=True)
            if _blocked[0] >= 8:
                print("too many throttle events, stopping early (rerun later to resume)", flush=True)
                break
    legs, seen = [], set()
    for q in qs:
        rec = load_json(RAW / f"{q['key']}.json")
        if not rec:
            continue
        for leg in to_legs(q, rec, dest_airport[q["city"]]):
            if leg["id"] in seen:
                continue
            seen.add(leg["id"])
            legs.append(leg)
    save_json(SET / "legs" / "google-sweep.json", legs)
    airlines = {}
    for leg in legs:
        airlines[leg["operator"]] = airlines.get(leg["operator"], 0) + 1
    top = sorted(airlines.items(), key=lambda x: -x[1])[:15]
    print(f"done: {len(legs)} legs from {sum(1 for q in qs if (RAW / (q['key'] + '.json')).exists())} queries; failed {failed}; airlines: {top}", flush=True)


if __name__ == "__main__":
    main()
