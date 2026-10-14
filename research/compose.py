"""Compose a research set: read legs/*.json, stays/*.json, destinations.json, discounts-*.json, bag-fees.json and
transfers/*.json, and write research/<set>.json.
Run: py -3 -X utf8 research/compose.py [set-folder-name]  (default 2026-12-europe)
Prints coverage and warnings. Never fetches anything."""
import glob
import json
import math
import os
import re
import sys
import time
import unicodedata
from collections import defaultdict
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from costs import BagFees, Transfers, bag_cost, leg_bags, transfers_pp  # noqa: E402

ROOT = os.path.dirname(os.path.abspath(__file__))
SET_NAME = sys.argv[1] if len(sys.argv) > 1 else "2026-12-europe"
SET = os.path.join(ROOT, SET_NAME)
ORIGIN = "TRD"
ORIGIN_INFO = {"code": ORIGIN, "name": "Trondheim Værnes", "lat": 63.4578, "lon": 10.924}
# A stay counts for a city only within this straight-line distance of its centre; Airbnb's cheapest results include
# cottages 30-70 km out. Island destinations named after the island take the whole island.
STAY_RADIUS_KM = 15
STAY_RADIUS_BY_CITY = {"LON": 22, "PAR": 20, "BER": 20, "IST": 22, "ROM": 20, "MAD": 20, "TCI": 70, "LPA": 60,
                       "TYO": 25, "SEL": 22, "BKK": 20, "DXB": 25, "SIN": 20, "KUL": 18, "FUE": 60}
ORIGIN_TRANSFER_FREE = True         # stated by the planner on 2026-10-11: getting to and from Værnes costs them nothing
# Where each traveller flies home to. Everyone starts at Værnes; at the end some may split off to Stavanger or Tønsberg
# (stated by the planner on 2026-10-13), flying home from the trip's last city on its last day. Getting from Sola or Torp
# to town costs nothing; from Oslo Gardermoen it is the Vy train to Tønsberg.
HOMES = [
    {"id": "trondheim", "name": "Trondheim", "short": "Værnes", "airport": "Værnes", "airports": [ORIGIN]},
    {"id": "stavanger", "name": "Stavanger", "short": "Sola", "airport": "Sola", "airports": ["SVG"]},
    {"id": "tonsberg", "name": "Tønsberg", "short": "Tønsberg", "airport": "Torp, or Oslo + train", "airports": ["TRF", "OSL"]},
]
HOME_AIRPORTS = {"SVG": "Stavanger Sola", "TRF": "Sandefjord Torp", "OSL": "Oslo Gardermoen"}
HOME_GEO = {"SVG": (58.8767, 5.6378), "TRF": (59.1867, 10.2586), "OSL": (60.1939, 11.1004)}  # OurAirports
VY_URL = ("https://www.vy.no/en/see-travel-suggestions?fromDateTime={date}T15%3A00%3A00.000Z&from=Oslo+lufthavn"
          "&fromExternalId=NSR%3ANSR%3AStopPlace%3A58211&fromPosition=60.193361%2C11.097887&to=T%C3%B8nsberg+stasjon"
          "&toExternalId=NSR%3ANSR%3AStopPlace%3A58876&toPosition=59.271692%2C10.409449&includeModes=train")
FREE_HOME = {"eur": 0.0, "min": 0, "mode": "own arrangement (free)", "to": "home", "hours": None}
# Checked on vy.no 13 Oct 2026 for 15 Dec: RE11 every hour from 05:13 to 23:13, 1 h 31 min, adult from NOK 249 (Lowfare) to NOK 399; students under
# 30 get 50 % off single tickets (vy.no/en/buy-tickets/train-tickets/discount), so about NOK 200.
OSL_TRAIN = {"eur": round(200 / 10.7155, 2), "min": 91 + 15, "mode": "train", "line": "Vy RE11 Oslo lufthavn → Tønsberg",
             "from": "Oslo lufthavn stasjon", "to": "Tønsberg stasjon", "hours": "05:13–23:13", "freq": "hourly", "fareText": "student single, 50 % off (about NOK 200)",
             "note": "Direct regional train, 1 h 31 min. Adult fares NOK 249–399; students under 30 get half price on single tickets."}
WINDOW_START, WINDOW_END, FLEX = "2026-12-07", "2026-12-15", 3
NIGHTS_OK = (7, 8, 9)
PARTY_DEFAULT = 3
TRAVELERS = {"age": 23, "students": True, "nationality": "NO"}
PRIOR_M, PRIOR_C = 40, 4.2          # Bayesian prior: weight in reviews, mean on a 5 scale
MIN_REVIEWS, MIN_RATING5 = 10, 4.0  # quality bar for stays kept in the set
PRIMARY_REVIEWS = 50                # a trip's stays need at least this many reviews (medium confidence) when possible
RT_OUTLIER = 2.5                    # ignore a round trip costing more than this times the city's cheapest
LONG_LEG_MIN = 600                  # a single leg over 10 h is flagged
INTER_TOLERANCE = 2                 # an intercity price seen within this many days of the travel date is used, and labelled
SCENARIOS = ("none", "cabin", "both")  # bag setups trips are optimised for; the app prices any setup
MAX_TWO_CITY, MAX_THREE_CITY = 900, 500  # per bag scenario
MIN_COMBOS_PER_CITY = 3                    # beyond the caps, every reachable city keeps its cheapest few multi-city combos
SINGLE_OW_PER_CITY = 4                    # one-way pairs kept per city and bag scenario
MAX_STAYS_PER_CITY = 30
MAX_LEG_EUR = 2500  # no fare in the set is near this (Tokyo round trips are about EUR 1,000)
MAX_ALTS = 5
SYNONYMS = {"krakow": "KRK", "cracow": "KRK", "warszawa": "WAW", "gdansk": "GDN", "wroclaw": "WRO", "poznan": "POZ",
            "rome": "ROM", "roma": "ROM", "milan": "MIL", "milano": "MIL", "venice": "VCE", "venezia": "VCE", "naples": "NAP",
            "napoli": "NAP", "florence": "FLR", "firenze": "FLR", "turin": "TRN", "torino": "TRN", "munich": "MUC", "muenchen": "MUC",
            "cologne": "CGN", "koln": "CGN", "dusseldorf": "CGN", "vienna": "VIE", "wien": "VIE", "prague": "PRG", "praha": "PRG",
            "lisbon": "LIS", "lisboa": "LIS", "athens": "ATH", "athina": "ATH", "istanbul": "IST", "bucharest": "BUH", "bucuresti": "BUH",
            "copenhagen": "CPH", "kobenhavn": "CPH", "gothenburg": "GOT", "goteborg": "GOT", "stockholm": "STO", "reykjavik": "REK",
            "funchal": "FNC", "madeira": "FNC", "valletta": "MLA", "malta": "MLA", "larnaca": "LCA", "paphos": "LCA", "mallorca": "PMI",
            "palma": "PMI", "palma de mallorca": "PMI", "las palmas": "LPA", "gran canaria": "LPA", "tenerife": "TCI",
            "santa cruz de tenerife": "TCI", "malaga": "AGP", "seville": "SVQ", "sevilla": "SVQ", "zurich": "ZRH", "geneva": "GVA",
            "geneve": "GVA", "basel": "BSL", "brussels": "BRU", "bruxelles": "BRU", "london": "LON", "edinburgh": "EDI", "glasgow": "GLA",
            "manchester": "MAN", "dublin": "DUB", "paris": "PAR", "lyon": "LYS", "nice": "NCE", "marseille": "MRS", "barcelona": "BCN",
            "madrid": "MAD", "valencia": "VLC", "alicante": "ALC", "porto": "OPO", "faro": "FAO", "bologna": "BLQ", "catania": "CTA",
            "palermo": "PMO", "bari": "BRI", "trieste": "TRS", "thessaloniki": "SKG", "sofia": "SOF", "belgrade": "BEG", "beograd": "BEG",
            "zagreb": "ZAG", "split": "SPU", "dubrovnik": "DBV", "ljubljana": "LJU", "tirana": "TIA", "sarajevo": "SJJ", "skopje": "SKP",
            "budapest": "BUD", "bratislava": "BTS", "amsterdam": "AMS", "berlin": "BER", "hamburg": "HAM", "frankfurt": "FRA",
            "dresden": "DRS", "leipzig": "LEJ", "nuremberg": "NUE", "nurnberg": "NUE", "helsinki": "HEL", "tallinn": "TLL", "riga": "RIX",
            "vilnius": "VNO", "trondheim": "TRD", "vaernes": "TRD"}
EXTRA_AIRPORTS = {"LHR": "LON", "LGW": "LON", "STN": "LON", "LTN": "LON", "LCY": "LON", "SEN": "LON", "CDG": "PAR", "ORY": "PAR",
                  "BVA": "PAR", "FCO": "ROM", "CIA": "ROM", "MXP": "MIL", "LIN": "MIL", "BGY": "MIL", "ARN": "STO", "BMA": "STO",
                  "NYO": "STO", "OTP": "BUH", "KEF": "REK", "TFS": "TCI", "TFN": "TCI", "SAW": "IST", "DUS": "CGN", "NRN": "CGN",
                  "TSF": "VCE", "PSA": "FLR", "KTW": "KRK", "WMI": "WAW", "KUN": "VNO", "EIN": "AMS", "RTM": "AMS", "CRL": "BRU",
                  "GRO": "BCN", "REU": "BCN", "PIK": "GLA", "LPL": "MAN", "PFO": "LCA", "FMM": "MUC", "HHN": "FRA"}


def load(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def norm(s):
    s = "".join(c for c in unicodedata.normalize("NFKD", s or "") if not unicodedata.combining(c))
    return re.sub(r"[^a-z ]", "", s.lower()).strip()


def d2s(d):
    return d.isoformat()


def s2d(s):
    return date.fromisoformat(s[:10])


class Data:
    def __init__(self):
        self.seed = load(os.path.join(SET, "seed-destinations.json"), [])
        facts = {d["code"]: d for d in load(os.path.join(SET, "destinations.json"), [])}
        self.dest = {}
        for d in self.seed:
            merged = dict(d)
            merged.update({k: v for k, v in facts.get(d["code"], {}).items() if k not in ("airports",)})
            fa = facts.get(d["code"], {}).get("airports")
            if isinstance(fa, list) and fa and isinstance(fa[0], dict):
                merged["airports"] = fa
            else:
                merged["airports"] = [{"code": a, "name": a, "transferMode": None, "transferMin": None, "transferEUR": None} for a in d["airports"]]
            merged.setdefault("schengen", True)
            merged.setdefault("entry", None)
            merged.setdefault("december", {"highC": None, "daylightH": None, "tags": []})
            self.dest[d["code"]] = merged
        self.airport_city = dict(EXTRA_AIRPORTS)
        for d in self.dest.values():
            for a in d["airports"]:
                self.airport_city.setdefault(a["code"], d["code"])
        self.name_code = {}
        for d in self.dest.values():
            self.name_code[norm(d["name"])] = d["code"]
            self.name_code[norm(d["name"].split(",")[0].split(" (")[0])] = d["code"]
        self.name_code.update(SYNONYMS)
        self.warnings = []

    def city_of(self, token):
        if not token:
            return None
        t = str(token).strip()
        if t.upper() == ORIGIN or t.upper() in HOME_AIRPORTS:
            return t.upper()
        if t.upper() in self.dest:
            return t.upper()
        if t.upper() in self.airport_city:
            return self.airport_city[t.upper()]
        n = norm(t)
        if n in self.name_code:
            return self.name_code[n]
        return self.name_code.get(n.split(",")[0].strip())


def youth_ok(leg):
    if leg.get("fareType") != "youth":
        return True
    m = re.search(r"(\d+)\s*[-–]\s*(\d+)", str(leg.get("fareEligibility") or "12-25"))
    return not m or int(m.group(1)) <= TRAVELERS["age"] <= int(m.group(2))


def load_legs(data, fees, transfers):
    legs = []
    for path in sorted(glob.glob(os.path.join(SET, "legs", "*.json"))):
        for raw in load(path, []) or []:
            if not isinstance(raw, dict) or raw.get("priceEUR") in (None, 0):
                continue
            leg = dict(raw)
            leg["fromCity"] = data.city_of(raw.get("fromCity")) or data.city_of(raw.get("from"))
            leg["toCity"] = data.city_of(raw.get("toCity")) or data.city_of(raw.get("to"))
            if not leg["fromCity"] or not leg["toCity"] or leg["fromCity"] == leg["toCity"]:
                data.warnings.append(f"leg {raw.get('id')} skipped: unknown city ({raw.get('fromCity')} -> {raw.get('toCity')})")
                continue
            leg["fareType"] = raw.get("fareType") or "adult"
            if not youth_ok(leg):
                continue
            leg["kind"] = raw.get("kind") or "flight"
            leg["priceEUR"] = float(raw["priceEUR"])
            if leg["priceEUR"] > MAX_LEG_EUR:  # a misread card (Explore once showed Rovaniemi at EUR 7,003), not a fare
                data.warnings.append(f"leg {raw.get('id')} skipped: implausible price EUR {leg['priceEUR']:.0f}")
                continue
            dur = raw.get("durationMin")
            leg["durationMin"] = int(dur) if isinstance(dur, (int, float)) else None
            leg["overnight"] = bool(raw.get("overnight"))
            leg["estimated"] = bool(raw.get("estimated"))
            leg["detailed"] = bool(raw.get("operator"))
            leg.pop("arrivalTransfer", None)
            leg.pop("departureTransfer", None)
            leg["bags"] = leg_bags(leg, fees)
            leg["transfers"] = transfers.for_leg(leg, ORIGIN)
            legs.append(leg)
    # fares checked with the operator (legs/rail-verified.json) replace the Rome2Rio ranges they name
    replaced = {l.get("replaces") for l in legs if l.get("replaces")}
    # and every other Rome2Rio range of the same kind on that pair: priced at its low end, a range would undercut the real fare
    checked = {(l["fromCity"], l["toCity"], l.get("kind")) for l in legs if l.get("source") == "rail-research"}
    legs = [l for l in legs if l.get("id") not in replaced and not (l.get("source") == "rome2rio" and (l["fromCity"], l["toCity"], l.get("kind")) in checked)]
    detailed = {(l["fromCity"], l["toCity"], l.get("date"), l.get("returnDate"), l.get("roundTrip")) for l in legs if l["detailed"]}
    return [l for l in legs if l["detailed"] or (l["fromCity"], l["toCity"], l.get("date"), l.get("returnDate"), l.get("roundTrip")) not in detailed]


def rating5(stay):
    r, scale = stay.get("rating"), stay.get("ratingScale") or 5
    if r is None:
        return None
    return round(float(r) * 5.0 / float(scale), 2)


def adjusted(stay):
    r5, n = rating5(stay), int(stay.get("reviews") or 0)
    if r5 is None:
        return round(PRIOR_C, 2)
    return round((n * r5 + PRIOR_M * PRIOR_C) / (n + PRIOR_M), 2)


def km_between(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def load_stays(data):
    stays = []
    hostel_loc = load(os.path.join(SET, "stays", "locations-hostelworld.json"), {}) or {}
    paths = [os.path.join(SET, "stays", "airbnb.json")] + sorted(glob.glob(os.path.join(SET, "stays", "hostelworld-*.json"))) + \
        sorted(p for p in glob.glob(os.path.join(SET, "stays", "*.json")) if os.path.basename(p) not in ("airbnb.json",) and not os.path.basename(p).startswith("hostelworld-"))
    seen = set()
    for path in paths:
        for raw in load(path, []) or []:
            if not isinstance(raw, dict) or raw.get("id") in seen:
                continue
            city = data.city_of(raw.get("city"))
            if not city or raw.get("roomType") == "shared_room":
                continue
            # a bed in a room shared with strangers, whatever the platform calls the room type ("Single Bed - 6 Bed Mixed
            # Dorm" came as a private room); a whole dorm room booked for the group says so ("Private 6 Bed Dorm")
            label = f"{raw.get('name') or ''} | {raw.get('typeTitle') or ''}"
            if re.search(r"\bdorm\b|capsule|shared (hotel )?room", label, re.I) and not re.search(r"\bprivate\b", label, re.I):
                data.warnings.append(f"stay {raw.get('id')} skipped: a bed in a shared room ({label[:60]})")
                continue
            nightly = raw.get("nightlyEUR")
            if nightly is None and raw.get("totalEUR") and raw.get("nights"):
                nightly = float(raw["totalEUR"]) / float(raw["nights"])
            if not nightly or nightly <= 0:
                continue
            if (raw.get("perPerson") and float(nightly) < 8) or (not raw.get("perPerson") and float(nightly) < 12):
                data.warnings.append(f"stay {raw.get('id')} skipped: implausible price {nightly}")
                continue
            s = dict(raw)
            s["city"] = city
            s["sleeps"] = int(raw.get("sleeps") or 2)
            s["perPerson"] = bool(raw.get("perPerson"))
            s["unitNightlyEUR"] = round(float(nightly) * (s["sleeps"] if s["perPerson"] else 1), 2)
            s["rating5"] = rating5(raw)
            s["adjusted"] = adjusted(raw)
            s["reviews"] = int(raw.get("reviews") or 0)
            s["confidence"] = "high" if s["reviews"] >= 200 else "medium" if s["reviews"] >= 50 else "low"
            if s.get("platform") == "hostelworld":
                m = re.search(r"hostelworld-(\d+)$", s["id"])
                loc = hostel_loc.get(m.group(1)) if m else None
                if loc:
                    s["lat"], s["lon"], s["address"] = loc["lat"], loc["lon"], loc.get("address")
            d = data.dest.get(city)
            if d and s.get("lat") is not None and s.get("lon") is not None:
                s["lat"], s["lon"] = round(float(s["lat"]), 4), round(float(s["lon"]), 4)
                s["centerKm"] = round(km_between(d["lat"], d["lon"], s["lat"], s["lon"]), 2)
                if s["centerKm"] > STAY_RADIUS_BY_CITY.get(city, STAY_RADIUS_KM):
                    data.warnings.append(f"stay {raw.get('id')} skipped: {s['centerKm']:.0f} km from the {city} centre")
                    continue
            seen.add(raw["id"])
            stays.append(s)
    return stays


def stay_cost_pp(stay, n, own=False):
    """Mirrors the app: share fills rooms or places to capacity; own gives everyone a bedroom or a room."""
    unit, cap = stay["unitNightlyEUR"], max(1, stay["sleeps"])
    if stay.get("roomType") == "entire_home":
        per = max(1, stay.get("bedrooms") or 1) if own else cap
        return math.ceil(n / per) * unit / n
    if own:
        return unit
    return math.ceil(n / cap) * unit / n


def pick_stays(stays_in_city, k=6):
    """Candidates that cover every party size and room setup: the app picks the cheapest for the current settings."""
    ok = [s for s in stays_in_city if s["reviews"] >= PRIMARY_REVIEWS and (s["rating5"] or 0) >= MIN_RATING5]
    if len(ok) < 3:
        ok = [s for s in stays_in_city if s["reviews"] >= MIN_REVIEWS and (s["rating5"] or 0) >= MIN_RATING5]
    if not ok:
        return []
    picks = []

    def add(s):
        if s and s["id"] not in [p["id"] for p in picks]:
            picks.append(s)

    for n, own in ((3, False), (2, False), (5, False), (3, True), (5, True)):
        fits = [s for s in ok if s["sleeps"] >= min(n, 2)]
        if fits:
            add(min(fits, key=lambda s: stay_cost_pp(s, n, own)))
    whole = [s for s in ok if s.get("roomType") == "entire_home" and s["sleeps"] >= 4]
    if whole:
        add(min(whole, key=lambda s: stay_cost_pp(s, 4)))
    cheapest = min(stay_cost_pp(s, 3) for s in ok)
    good = sorted([s for s in ok if stay_cost_pp(s, 3) <= cheapest * 1.8], key=lambda s: (-s["adjusted"], stay_cost_pp(s, 3)))
    for s in good[:2]:
        add(s)
    return picks[:k]


def leg_cost(leg, scenario="none", n=PARTY_DEFAULT):
    return leg["priceEUR"] + bag_cost(leg, scenario) + transfers_pp(leg, n)[0]


def leg_minutes(leg, n=PARTY_DEFAULT):
    return (leg.get("durationMin") or 0) + transfers_pp(leg, n)[1]


def score(leg, scenario="none"):
    return leg_cost(leg, scenario) + leg_minutes(leg) / 60.0 * 2.0  # 2 EUR per hour of travel as a tie-breaker


# Sources that list every day a route runs: a missing day means no service then, not a gap in the research.
DAILY_SOURCES = {"ryanair-api"}
DAILY_OPERATORS = {"Ryanair"}  # the same holds for a Ryanair flight seen on Google: the Ryanair API lists every day it flies
# (source, from city, to city, date) searches that were made, so a day with no result is known to have no service
SEARCHED = set()


def load_searched():
    """FlixBus: the sweep searched every pair on its sweep dates; flixbus.py --dated records the exact-date searches."""
    sweep = {"2026-12-10", "2026-12-13"}
    for leg in load(os.path.join(SET, "legs", "flixbus.json"), []) or []:
        for d in sweep:
            SEARCHED.add(("flixbus-api", leg.get("fromCity"), leg.get("toCity"), d))
    for key in load(os.path.join(SET, "raw", "flixbus", "dated-done.json"), []) or []:
        a, b, d = key.split("-", 2)
        SEARCHED.add(("flixbus-api", a, b, d))


def best_leg(cands, want_date, tolerance, scenario):
    """Best leg on the travel date. A fare for that day wins whenever one exists: a cheaper one seen on another day is
    not bookable on this one. Otherwise dated legs within tolerance days qualify (and are labelled in the app), unless
    their source is known to have no service on the travel date (or the leg lists every departure, like a weekly ferry);
    undated legs (price ranges) always do."""
    best = None
    if any(l.get("date") for l in cands):
        cands = [l for l in cands if not l.get("estimated")]
    exact = [l for l in cands if l.get("date") and s2d(l["date"]) == want_date]
    if exact:
        # an operator's range spanning the dates it was checked on gives way to that day's own fare
        groups = {l.get("group") for l in exact if l.get("group")}
        cands = exact + [l for l in cands if not l.get("date") and not (l.get("span") and l.get("group") in groups)]
    want = want_date.isoformat()
    for leg in cands:
        if leg.get("date"):
            gap = abs((s2d(leg["date"]) - want_date).days)
            if gap > tolerance:
                continue
            src = leg.get("source")
            if gap and (leg.get("datesOnly") or src in DAILY_SOURCES or leg.get("operator") in DAILY_OPERATORS or (src, leg.get("fromCity"), leg.get("toCity"), want) in SEARCHED):
                continue
            sc = score(leg, scenario) + gap * 3.0
        else:
            sc = score(leg, scenario) + 5.0
        if best is None or sc < best[0]:
            best = (sc, leg)
    return best[1] if best else None



ACTIVITY_CATEGORIES = ("event", "sight", "museum", "food", "nightlife", "experience")
CATEGORY_ALIASES = {"sights": "sight", "landmark": "sight", "museums": "museum", "gallery": "museum", "events": "event",
                    "festival": "event", "market": "event", "bar": "nightlife", "club": "nightlife", "party": "nightlife",
                    "drink": "nightlife", "eat": "food", "restaurant": "food", "activity": "experience", "do": "experience"}


def http_url(u):
    return u.strip() if isinstance(u, str) and u.strip().startswith(("http://", "https://")) else None


def num_or_none(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, 1) if math.isfinite(f) and f >= 0 else None


def iso_date(v):
    if not isinstance(v, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v.strip()):
        return None
    try:
        return date.fromisoformat(v.strip()).isoformat()
    except ValueError:
        return None


def attach_city_info(data):
    """The Wikivoyage article (wikivoyage.py) and airport coordinates (locations.py). Weather and everyday prices are not
    part of a set: they live in places/places.json (scripts/climate.py, prices.py, places.py), which every set shares."""
    airports = load(os.path.join(SET, "airports-geo.json"), {}) or {}
    for code, d in data.dest.items():
        for a in d.get("airports") or []:
            geo = airports.get(str(a.get("code")).upper())
            if geo:
                a["lat"], a["lon"] = geo["lat"], geo["lon"]
                if not a.get("name") or a.get("name") == a.get("code"):
                    a["name"] = geo["name"]
        cand = load(os.path.join(SET, "activities", "candidates", f"{code}.json"), {}) or {}
        if cand.get("wikivoyage"):
            d["wikivoyage"] = cand["wikivoyage"]


def load_activities(data):
    """Things to do picked and priced by agents (activities/curated-*.json) and December events (activities/events-*.json)."""
    paths = sorted(glob.glob(os.path.join(SET, "activities", "events-*.json"))) + sorted(glob.glob(os.path.join(SET, "activities", "curated-*.json")))
    by_key, order = {}, []
    for path in paths:
        raw = load(path, []) or []
        if isinstance(raw, dict):
            raw = raw.get("items") or raw.get("activities") or []
        for a in raw:
            if not isinstance(a, dict):
                continue
            city = str(a.get("city") or "").strip().upper()
            name = re.sub(r"\s+", " ", str(a.get("name") or "")).strip()
            if city not in data.dest or not name:
                data.warnings.append(f"activity skipped ({os.path.basename(path)}): {city} {name[:40]}")
                continue
            cat = str(a.get("category") or "").strip().lower()
            cat = cat if cat in ACTIVITY_CATEGORIES else CATEGORY_ALIASES.get(cat, "experience")
            price, student = num_or_none(a.get("priceEUR")), num_or_none(a.get("studentEUR"))
            if student is not None and price is not None and student >= price:
                student = None
            dates = a.get("dates") if isinstance(a.get("dates"), dict) else {}
            start, end = iso_date(dates.get("start")), iso_date(dates.get("end"))
            item = {"city": city, "name": name, "category": cat, "blurb": str(a.get("blurb") or "").strip()[:220] or None,
                    "priceEUR": price, "studentEUR": student, "priceText": (str(a.get("priceText")).strip()[:160] if a.get("priceText") else None),
                    "priceBasis": (str(a.get("priceBasis")).strip()[:40] if a.get("priceBasis") else None),
                    "when": (str(a.get("when")).strip()[:160] if a.get("when") else None),
                    "dates": {"start": start, "end": end or start} if start else None,
                    "datesConfirmed": bool(a.get("datesConfirmed")) if start else None,
                    "bookAhead": bool(a.get("bookAhead")), "url": http_url(a.get("url")), "source": http_url(a.get("source")),
                    "file": os.path.basename(path)}
            key = (city, norm(name))
            if key in by_key:  # same place from two files: keep the first, fill its gaps
                cur = by_key[key]
                for k, v in item.items():
                    if cur.get(k) in (None, "", False) and v not in (None, "", False):
                        cur[k] = v
                continue
            by_key[key] = item
            order.append(key)
    out, used = [], set()
    rank = {c: i for i, c in enumerate(ACTIVITY_CATEGORIES)}
    for key in sorted(order, key=lambda k: (k[0], rank[by_key[k]["category"]], by_key[k]["priceEUR"] if by_key[k]["priceEUR"] is not None else 999)):
        item = by_key[key]
        base = f"{item['city']}-{re.sub(r'[^a-z0-9]+', '-', norm(item['name'])).strip('-')[:40]}"
        aid, i = base, 2
        while aid in used:
            aid, i = f"{base}-{i}", i + 1
        used.add(aid)
        out.append({"id": aid, **{k: v for k, v in item.items() if v is not None and v is not False}})
    return out


def homes_note():
    """Until Google Flights has been read for most flights home, say which airlines the flights home come from."""
    pairs = load(os.path.join(SET, "raw", "homes", "pairs.json"), []) or []
    searched = {os.path.basename(p)[5:-5] for p in glob.glob(os.path.join(SET, "raw", "google", "home-*.json"))}
    wanted = [f"{c}-{a}-{d}" for c, d, _ in pairs for a in ("SVG", "OSL")]
    done = sum(1 for k in wanted if k in searched)
    if not wanted or done >= 0.9 * len(wanted):
        return None
    share = round(100 * done / len(wanted))
    google = "not checked yet" if share < 5 else f"checked for {share} % of them so far"
    return ("Flights home to Sola and Oslo come from SAS, Ryanair and Wizz Air. Google Flights (KLM, Norwegian and the rest) is "
            f"{google}, so some flights home may be cheaper than shown, and routes with no flight found that day are hidden.")


def compose():
    data = Data()
    fees = BagFees(SET)
    fees.countries = {code: d.get("cc") for code, d in data.dest.items()} | {ORIGIN: "NO"} | {h: "NO" for h in HOME_AIRPORTS}
    transfers = Transfers(SET, data)
    if ORIGIN_TRANSFER_FREE:  # the travelers get to and from their home airport at no cost
        transfers.airport[ORIGIN] = {"public": dict(FREE_HOME), "taxi": None}
    transfers.airport["SVG"] = {"public": dict(FREE_HOME), "taxi": None}
    transfers.airport["TRF"] = {"public": dict(FREE_HOME), "taxi": None}
    transfers.airport["OSL"] = {"public": dict(OSL_TRAIN, url=VY_URL.format(date="2026-12-15")), "taxi": None}
    transfers.fixed_codes = {ORIGIN, *HOME_AIRPORTS}
    legs = load_legs(data, fees, transfers)
    load_searched()
    stays = load_stays(data)
    by_city = defaultdict(list)
    for s in stays:
        by_city[s["city"]].append(s)
    picks = {c: pick_stays(v) for c, v in by_city.items()}

    rt, out_one, back_one, inter = defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list)
    home_back = defaultdict(list)  # (city, home id) -> flights from that city to that home's airports
    home_of = {a: h["id"] for h in HOMES[1:] for a in h["airports"]}
    route_index = defaultdict(list)
    for leg in legs:
        route_index[(leg["fromCity"], leg["toCity"], bool(leg.get("roundTrip")))].append(leg)
        if leg["toCity"] in HOME_AIRPORTS:
            home_back[(leg["fromCity"], home_of[leg["toCity"]])].append(leg)
            continue
        if leg["fromCity"] == ORIGIN and leg.get("roundTrip"):
            rt[leg["toCity"]].append(leg)
        elif leg["fromCity"] == ORIGIN:
            out_one[leg["toCity"]].append(leg)
        elif leg["toCity"] == ORIGIN:
            back_one[leg["fromCity"]].append(leg)
        else:
            inter[(leg["fromCity"], leg["toCity"])].append(leg)

    # A city whose own airport has no one-way flights from home but which lists a neighbour's airport (Bratislava and
    # Vienna) uses that airport's real one-way fares, with the ride from it to the city as the transfer.
    for code, d in data.dest.items():
        for direction, store in (("out", out_one), ("back", back_one)):
            if store.get(code):
                continue
            for ap in d.get("airports", [])[1:]:
                other = data.city_of(ap.get("code"))
                if not other or other == code or not store.get(other):
                    continue
                for leg in store[other]:
                    if str(leg.get("to" if direction == "out" else "from") or "").upper() != str(ap["code"]).upper():
                        continue
                    e = dict(leg)
                    e["id"] = f"{leg['id']}-for-{code}"
                    e["toCity" if direction == "out" else "fromCity"] = code
                    e["notes"] = "; ".join(x for x in (leg.get("notes"), f"flies to {ap.get('name') or ap['code']}, the nearest airport with flights from home") if x)
                    e["transfers"] = transfers.for_leg(e, ORIGIN)
                    store[code].append(e)
                    legs.append(e)

    # Half a round trip only stands in where no one-way was searched for: where the one-way searches were made and
    # found nothing sensible (Strasbourg's own airport), the trips that need one are not built at all.
    searched_one_way = {os.path.basename(p).split("-")[1] for p in glob.glob(os.path.join(SET, "raw", "google", "out-*.json"))}
    est_legs = []  # half a round trip where no one-way was captured at all (flagged on the trip)
    for city, rts in rt.items():
        cheapest = min(rts, key=leg_cost)
        for direction, store in (("out", out_one), ("back", back_one)):
            if store.get(city) or city in searched_one_way:
                continue
            e = dict(cheapest)
            half_bags = json.loads(json.dumps(cheapest["bags"]))
            for b in half_bags.values():
                b["addEUR"] = round((b.get("addEUR") or 0) / 2, 2)
            e.update({"id": f"est-{direction}-{city}", "roundTrip": False, "estimated": True, "priceEUR": round(cheapest["priceEUR"] / 2.0, 2),
                      "notes": "estimate: half of the cheapest round trip; no one-way price captured", "date": None, "returnDate": None,
                      "bags": half_bags})
            if direction == "back":
                e["from"], e["to"], e["fromCity"], e["toCity"] = cheapest.get("to"), ORIGIN, city, ORIGIN
                e["durationMin"] = cheapest.get("durationBackMin") or cheapest.get("durationMin")
            e["transfers"] = transfers.for_leg(e, ORIGIN)
            store[city].append(e)
            est_legs.append(e)
    legs.extend(est_legs)
    leg_by_id = {l["id"]: l for l in legs}
    stay_by_id = {s["id"]: s for s in stays}

    def alternatives(leg):
        pool = route_index.get((leg["fromCity"], leg["toCity"], bool(leg.get("roundTrip"))), [])
        same = [l for l in pool if l["id"] != leg["id"] and (not leg.get("date") or (l.get("date") == leg.get("date") and l.get("returnDate") == leg.get("returnDate")))]
        out, ops = [], {(leg.get("operator") or "?", leg.get("fareType"), leg["kind"])}
        for l in sorted(same, key=leg_cost):
            key = (l.get("operator") or "?", l.get("fareType"), l["kind"])
            if key in ops:
                continue
            ops.add(key)
            out.append(l["id"])
            if len(out) >= MAX_ALTS:
                break
        return out

    def misses_train(leg):
        """Lands at Oslo too late for the last train to Tønsberg (OSL_TRAIN hours, about 25 minutes from gate to platform)."""
        if leg["toCity"] != "OSL" or not leg.get("arrTime"):
            return False
        last = OSL_TRAIN["hours"].split("–")[1]
        lands = int(leg["arrTime"][:2]) * 60 + int(leg["arrTime"][3:5]) + 25
        return bool(leg.get("arrDate") and leg.get("date") and leg["arrDate"] > leg["date"]) or lands > int(last[:2]) * 60 + int(last[3:])

    def home_options(tl, stops, start):
        """For each home other than Værnes, what replaces the flight back for someone going there: the best flight from the
        last city on the last day (to Sola, or to Torp or Oslo for Tønsberg). A round trip cannot be split, so that person
        books the outbound one-way of the same day instead. Missing when no flight was found that day."""
        end_city, end_date = stops[-1]["city"], s2d(stops[-1]["checkout"])
        out = {}
        for h in HOMES[1:]:
            cands = home_back.get((end_city, h["id"])) or []
            hl = best_leg(cands, end_date, 0, "none") if cands else None
            if not hl:
                continue
            if misses_train(hl):  # a flight that still makes the train wins unless the late one saves more than EUR 30
                ok = best_leg([l for l in cands if not misses_train(l)], end_date, 0, "none")
                if ok and score(ok) - score(hl) < 30:
                    hl = ok
            repl = [hl]
            if tl[-1].get("roundTrip"):
                lo = best_leg(out_one.get(end_city) or [], start, 0, "none")
                if not lo:
                    continue
                repl = [lo, hl]
            same_day = sorted((l for l in cands if l["id"] != hl["id"] and l.get("date") == hl.get("date")), key=leg_cost)
            alts, ops = [], {(hl.get("operator") or "?", hl["toCity"])}
            for l in same_day:
                key = (l.get("operator") or "?", l["toCity"])
                if key not in ops:
                    ops.add(key)
                    alts.append(l["id"])
                if len(alts) >= MAX_ALTS:
                    break
            heads = []
            for l in repl:
                mins = l.get("durationMin") or 0
                if mins >= LONG_LEG_MIN or l.get("overnight"):
                    heads.append(f"Long flight home to {h['name']}: {l['fromCity']} to {HOME_AIRPORTS.get(l['toCity'], l['toCity'])} takes {round(mins / 60)} h"
                                 + (" with an overnight stop" if l.get("overnight") else ""))
                if l.get("estimated"):
                    heads.append(f"Estimated fare for {l['fromCity']} to {l['toCity']}: half of a round trip, verify at the link")
            out[h["id"]] = {"legs": [l["id"] for l in repl], "alts": alts, **({"headsUp": heads} if heads else {})}
        return out

    trips, used_legs, used_stays, seen_trips = [], set(), set(), set()

    def finish(trip_legs, leg_dates, cities_nights, kind, start):
        key = (tuple(trip_legs), d2s(start), tuple(c for c, _ in cities_nights))
        if key in seen_trips:
            return
        seen_trips.add(key)
        tl = [leg_by_id[i] for i in trip_legs]
        stops, day = [], start
        for c, nights in cities_nights:
            cand = picks[c]
            stops.append({"city": c, "stay": cand[0]["id"], "nights": nights, "checkin": d2s(day), "checkout": d2s(day + timedelta(days=nights)),
                          "altStays": [s["id"] for s in cand[1:]]})
            day += timedelta(days=nights)
        st = [stay_by_id[s["stay"]] for s in stops]
        pp = {}
        for n in (2, 3, 4, 5):
            pp[str(n)] = round(sum(l["priceEUR"] + transfers_pp(l, n)[0] for l in tl) +
                               sum(min(stay_cost_pp(stay_by_id[i], n) for i in [s["stay"], *s["altStays"]]) * s["nights"] for s in stops), 2)
        heads = []
        for l, d in zip(tl, leg_dates):
            mins = l.get("durationMin") or 0
            if mins >= LONG_LEG_MIN or l.get("overnight"):
                heads.append(f"Long transfer: {l['fromCity']} to {l['toCity']} takes {round(mins / 60)} h" + (" with an overnight stop" if l.get("overnight") else ""))
            if l.get("estimated"):
                heads.append(f"Estimated fare for {l['fromCity']} to {l['toCity']}: half of a round trip, verify at the link")
        for s in stops:
            dd = data.dest[s["city"]]
            if not dd.get("schengen") and dd.get("entry"):
                heads.append(f"{dd['name']}: {dd['entry']}")
        homes = home_options(tl, stops, start)
        trips.append({
            "id": f"{kind}-" + "-".join(c for c, _ in cities_nights) + "-" + d2s(start).replace("-", "")[4:] + f"-{len(trips)}",
            "kind": kind, "start": stops[0]["checkin"], "end": stops[-1]["checkout"], "nights": sum(s["nights"] for s in stops),
            "stops": stops, "legs": trip_legs, "legDates": leg_dates, "legAlternatives": [alternatives(l) for l in tl],
            "operators": sorted({l.get("operator") or l["kind"] for l in tl}),
            "transportPP": round(sum(l["priceEUR"] for l in tl), 2), "transitMin": sum(leg_minutes(l) for l in tl),
            "ppEstimate": pp, "weakestAdjusted": min(s["adjusted"] for s in st), "headsUp": sorted(set(heads)),
            "estimated": any(l.get("estimated") for l in tl), "youthFare": any(l.get("fareType") == "youth" for l in tl),
            **({"homes": homes} if homes else {}),
        })
        used_legs.update(trip_legs)
        for h in homes.values():
            used_legs.update(h["legs"])
            used_legs.update(h["alts"])
        for alts in trips[-1]["legAlternatives"]:
            used_legs.update(alts)
        for s in stops:
            used_stays.add(s["stay"])
            used_stays.update(s["altStays"])

    # 1. single city: per date pair, the best round trip for each bag scenario
    for city, rts in rt.items():
        if not picks.get(city):
            continue
        floor = min(leg_cost(l) for l in rts)
        by_dates = defaultdict(list)
        for leg in rts:
            if not leg.get("date") or not leg.get("returnDate") or leg_cost(leg) > floor * RT_OUTLIER:
                continue
            nights = (s2d(leg["returnDate"]) - s2d(leg["date"])).days
            if nights in NIGHTS_OK:
                by_dates[(leg["date"], leg["returnDate"])].append(leg)
        for (d1, d2), cands in by_dates.items():
            for sc in SCENARIOS:
                leg = min(cands, key=lambda l: score(l, sc))
                finish([leg["id"]], [d1], [(city, (s2d(d2) - s2d(d1)).days)], "single", s2d(d1))

    starts = [s2d(WINDOW_START) + timedelta(days=k) for k in range(-2, 3)]  # Dec 5 to 9: the start dates the fare sweep covers
    cities_out = [c for c in out_one if picks.get(c)]
    cities_back = {c for c in back_one if picks.get(c)}

    # 1b. single city on two one-way tickets: often cheaper than a round trip, and covers routes whose round-trip search failed
    for city in [c for c in cities_out if c in cities_back]:
        for sc in SCENARIOS:
            combos = []
            for d1 in starts:
                lo = best_leg(out_one[city], d1, 0, sc)
                if not lo:
                    continue
                for nights in NIGHTS_OK:
                    lb = best_leg(back_one[city], d1 + timedelta(days=nights), 0, sc)
                    if lb and not (lo.get("estimated") and lb.get("estimated")):
                        combos.append((score(lo, sc) + score(lb, sc), d1, nights, lo, lb))
            for _, d1, nights, lo, lb in sorted(combos, key=lambda x: x[0])[:SINGLE_OW_PER_CITY]:
                finish([lo["id"], lb["id"]], [d2s(d1), d2s(d1 + timedelta(days=nights))], [(city, nights)], "single", d1)

    for sc in SCENARIOS:
        # 2. two cities
        two = []
        for a in cities_out:
            for b in cities_back:
                if a == b or not inter.get((a, b)):
                    continue
                for n1, n2 in ((3, 5), (4, 4), (5, 3)):
                    for start in starts:
                        lo = best_leg(out_one[a], start, 0, sc)
                        lb = best_leg(back_one[b], start + timedelta(days=n1 + n2), 0, sc)
                        if not lo or not lb:
                            continue
                        mid = best_leg(inter[(a, b)], start + timedelta(days=n1), INTER_TOLERANCE, sc)
                        if mid:
                            two.append((score(lo, sc) + score(mid, sc) + score(lb, sc), a, b, n1, n2, start, lo, mid, lb))
        two.sort(key=lambda x: x[0])
        taken, count, shown = set(), 0, defaultdict(int)
        for cost, a, b, n1, n2, start, lo, mid, lb in two:
            if (a, b, n1, n2) in taken:
                continue
            if count >= MAX_TWO_CITY and min(shown[a], shown[b]) >= MIN_COMBOS_PER_CITY:
                continue  # past the cap, only combos that bring a rarely shown city
            taken.add((a, b, n1, n2))
            count += 1
            shown[a] += 1
            shown[b] += 1
            finish([lo["id"], mid["id"], lb["id"]], [d2s(start), d2s(start + timedelta(days=n1)), d2s(start + timedelta(days=n1 + n2))],
                   [(a, n1), (b, n2)], "two", start)

        # 3. three cities (3+3+2 nights)
        three = []
        for a in cities_out:
            for b in picks:
                if b == a or not picks.get(b) or not inter.get((a, b)):
                    continue
                for c in cities_back:
                    if c in (a, b) or not inter.get((b, c)):
                        continue
                    for start in starts[::2]:
                        lo = best_leg(out_one[a], start, 0, sc)
                        lb = best_leg(back_one[c], start + timedelta(days=8), 0, sc)
                        if not (lo and lb):
                            continue
                        m1 = best_leg(inter[(a, b)], start + timedelta(days=3), INTER_TOLERANCE, sc)
                        m2 = best_leg(inter[(b, c)], start + timedelta(days=6), INTER_TOLERANCE, sc)
                        if m1 and m2:
                            three.append((score(lo, sc) + score(m1, sc) + score(m2, sc) + score(lb, sc), a, b, c, start, lo, m1, m2, lb))
        three.sort(key=lambda x: x[0])
        taken, count, shown = set(), 0, defaultdict(int)
        for cost, a, b, c, start, lo, m1, m2, lb in three:
            if (a, b, c) in taken:
                continue
            if count >= MAX_THREE_CITY and min(shown[a], shown[b], shown[c]) >= MIN_COMBOS_PER_CITY:
                continue
            taken.add((a, b, c))
            count += 1
            shown[a] += 1
            shown[b] += 1
            shown[c] += 1
            finish([lo["id"], m1["id"], m2["id"], lb["id"]], [d2s(start + timedelta(days=k)) for k in (0, 3, 6, 8)],
                   [(a, 3), (b, 3), (c, 2)], "three", start)

    trips.sort(key=lambda t: t["ppEstimate"][str(PARTY_DEFAULT)])
    keep_stays = []
    for city, lst in by_city.items():
        ok = [s for s in lst if s["reviews"] >= MIN_REVIEWS and (s["rating5"] or 0) >= MIN_RATING5]
        ok.sort(key=lambda s: stay_cost_pp(s, PARTY_DEFAULT))
        chosen = {s["id"]: s for s in ok[:MAX_STAYS_PER_CITY]}
        for s in sorted(ok, key=lambda s: -s["adjusted"])[:10]:
            chosen[s["id"]] = s
        for s in lst:
            if s["id"] in used_stays:
                chosen[s["id"]] = s
        stay_fields = ("id", "city", "platform", "name", "typeTitle", "roomType", "sleeps", "bedrooms", "beds", "baths", "checkin", "checkout",
                       "nights", "totalEUR", "nightlyEUR", "perPerson", "rating", "ratingScale", "reviews", "url", "includes", "missing",
                       "notes", "unitNightlyEUR", "rating5", "adjusted", "confidence", "lat", "lon", "centerKm", "address")
        keep_stays.extend({k: s.get(k) for k in stay_fields if s.get(k) is not None or k in ("rating", "rating5")} for s in chosen.values())
    leg_fields = ("id", "kind", "from", "to", "fromCity", "toCity", "date", "returnDate", "roundTrip", "operator", "operatedBy", "stops", "via",
                  "durationMin", "durationBackMin", "layoverMin", "overnight", "depTime", "arrTime", "arrDate", "priceEUR", "priceMaxEUR", "priceTypicalEUR",
                  "fareType", "fareFamily", "url", "source", "includes", "missing", "notes", "bags", "transfers", "estimated", "flights", "cabin")
    keep_legs = []
    for l in legs:
        if l["id"] in used_legs:
            slim = {k: l.get(k) for k in leg_fields if l.get(k) is not None}
            if slim.get("notes"):
                slim["notes"] = slim["notes"][:240]
            keep_legs.append(slim)
    discounts = []
    for path in sorted(glob.glob(os.path.join(SET, "discounts-*.json"))):
        for d in load(path, []) or []:
            if isinstance(d, dict):
                d = dict(d)
                d["file"] = os.path.basename(path)
                discounts.append(d)
    operators = defaultdict(int)
    for t in trips:
        for o in t["operators"]:
            operators[o] += 1
    bag_sources = defaultdict(int)
    for l in keep_legs:
        bag_sources[l["bags"]["checked"]["basis"]] += 1
    transfer_cover = sum(1 for l in keep_legs for t in l["transfers"] if t.get("public") or t.get("taxi"))
    transfer_total = sum(len(l["transfers"]) for l in keep_legs)
    attach_city_info(data)
    activities = load_activities(data)
    out = {
        "schema": 1,
        "meta": {"id": SET_NAME, "title": "Europe winter 2026", "origin": ORIGIN, "currency": "EUR", "originInfo": ORIGIN_INFO,
                 "window": {"start": WINDOW_START, "end": WINDOW_END, "flexDays": FLEX}, "party": {"min": 2, "max": 6, "default": PARTY_DEFAULT},
                 "homes": HOMES, "homesNote": homes_note(), "homeAirports": [{"code": c, "name": n, "lat": HOME_GEO[c][0], "lon": HOME_GEO[c][1]} for c, n in HOME_AIRPORTS.items()],
                 "travelers": TRAVELERS,
                 "capturedAt": max([l.get("capturedAt") or "" for l in legs] + [s.get("capturedAt") or "" for s in stays] + [""]),
                 "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "prior": {"reviews": PRIOR_M, "mean": PRIOR_C},
                 "sources": sorted({l.get("source") for l in legs if l.get("source")} | {s.get("platform") for s in stays if s.get("platform")}
                                  | ({"wikivoyage"} if activities else set())),
                 "counts": {"destinations": len(data.dest), "legs": len(keep_legs), "stays": len(keep_stays), "trips": len(trips),
                            "tripsByKind": {k: len([t for t in trips if t["kind"] == k]) for k in ("single", "two", "three")},
                            "legsCaptured": len(legs), "staysCaptured": len(stays), "discounts": len(discounts),
                            "transfersPriced": transfer_cover, "transfersTotal": transfer_total,
                            "activities": len(activities)}},
        "destinations": list(data.dest.values()),
        "legs": keep_legs,
        "stays": keep_stays,
        "discounts": discounts,
        "activities": activities,
        "trips": trips,
    }
    return out, data, dict(operators), dict(bag_sources)


def report(out, data, operators, bag_sources):
    m = out["meta"]["counts"]
    print(f"destinations {m['destinations']}  legs {m['legs']} (of {m['legsCaptured']} captured)  stays {m['stays']} (of {m['staysCaptured']})  "
          f"trips {m['trips']} {m['tripsByKind']}  discounts {m['discounts']}  activities {m.get('activities', 0)}")
    print(f"transfers priced on {m['transfersPriced']} of {m['transfersTotal']} airport or station hops")
    print("estimated-fare trips:", sum(1 for t in out["trips"] if t["estimated"]), " youth-fare trips:", sum(1 for t in out["trips"] if t["youthFare"]))
    print("operators in trips (top 10):", sorted(operators.items(), key=lambda x: -x[1])[:10])
    print("checked-bag price basis (legs):", sorted(bag_sources.items(), key=lambda x: -x[1])[:8])
    if out["trips"]:
        t = out["trips"][0]
        print("cheapest trip:", t["id"], t["ppEstimate"], t["operators"])
    skipped = [w for w in data.warnings if "skipped" in w]
    print(f"warnings: {len(data.warnings)}; first: " + " | ".join(skipped[:2]))


if __name__ == "__main__":
    out, data, operators, bag_sources = compose()
    path = os.path.join(ROOT, f"{SET_NAME}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"wrote {path} ({os.path.getsize(path) // 1024} KB)")
    report(out, data, operators, bag_sources)
