"""Bag fees and airport or station transfers, attached to every leg by compose.py.

Bags: each leg gets bags.cabin / bags.checked / bags.both with the extra cost per person to travel with that luggage on
that leg (0 when the fare or mode already includes it), whether the figure is exact or an estimate, and why.
Sources, best first: the leg's own fare data (SAS Standard upgrade price per flight), fixed prices an airline publishes
per route group (bag-fees-verified.json: SAS Light add-ons, exact), sampled fare-family prices (youth-fare-samples.json:
KLM Standard, Norwegian LowFare+), the researched fee table (bag-fees.json, typical), then defaults.

Transfers: each leg gets transfers[], one per airport or station it touches, with the cheapest public option
(per person) and a taxi or ride-hailing estimate (per car). The app picks per group size; compose scores with the
default party."""
import glob
import json
import math
import os
import re
import statistics

BUDGET_DEFAULT = {"cabin": 15.0, "checked": 30.0, "both": 42.0}
LEGACY_DEFAULT = {"cabin": 0.0, "checked": 35.0, "both": 35.0}
STATION_MINUTES = 15
LOCAL_TICKET_DEFAULT = 2.0  # a single city ticket where no local figure was researched
ALIASES = {
    "scandinavian airlines": "SAS", "sas": "SAS", "wideroe": "Widerøe", "widerøe": "Widerøe", "norwegian": "Norwegian",
    "norwegian air shuttle": "Norwegian", "norwegian air sweden": "Norwegian", "klm": "KLM", "klm cityhopper": "KLM",
    "air france": "Air France", "lufthansa": "Lufthansa", "lufthansa city airlines": "Lufthansa", "air dolomiti": "Lufthansa",
    "swiss": "SWISS", "austrian": "Austrian", "brussels airlines": "Brussels Airlines", "eurowings": "Eurowings",
    "finnair": "Finnair", "airbaltic": "airBaltic", "air baltic": "airBaltic", "lot": "LOT", "ryanair": "Ryanair",
    "buzz": "Ryanair", "malta air": "Ryanair", "wizz air": "Wizz Air", "wizz": "Wizz Air", "easyjet": "easyJet",
    "transavia": "Transavia", "vueling": "Vueling", "volotea": "Volotea", "iberia": "Iberia", "iberia express": "Iberia Express",
    "tap air portugal": "TAP Air Portugal", "tap": "TAP Air Portugal", "ita": "ITA Airways", "ita airways": "ITA Airways",
    "aegean": "Aegean", "aegean airlines": "Aegean", "olympic air": "Aegean", "turkish airlines": "Turkish Airlines",
    "pegasus": "Pegasus", "icelandair": "Icelandair", "croatia airlines": "Croatia Airlines", "air serbia": "Air Serbia",
    "jet2": "Jet2", "binter": "Binter", "luxair": "Luxair",
}
BUDGET = {"Ryanair", "Wizz Air", "easyJet", "Transavia", "Vueling", "Volotea", "Pegasus", "Jet2", "Norwegian", "airBaltic"}
SCANDINAVIA = {"NO", "SE", "DK"}
# countries SAS prices as "Europe" (its Scandinavia-Europe route group); anything else is left to the typical table
EUROPE = {"AL", "AT", "BA", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR", "HR", "HU", "IE", "IS",
          "IT", "LT", "LU", "LV", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "SE", "SI", "SK"}


def _load(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def canonical_airline(name):
    if not name:
        return None
    n = re.sub(r"\s+", " ", str(name).strip().lower())
    if n in ALIASES:
        return ALIASES[n]
    for k, v in ALIASES.items():
        if n.startswith(k):
            return v
    return str(name).strip()


def first_airline(operator):
    if not operator:
        return None
    first = re.split(r",| and ", operator)[0]
    return canonical_airline(first)


class BagFees:
    def __init__(self, set_dir):
        self.fees = {}
        for e in _load(os.path.join(set_dir, "bag-fees.json"), []) or []:
            name = canonical_airline(e.get("airline"))
            if name:
                self.fees[name] = e
        self.sampled = self._sampled_upgrades(_load(os.path.join(set_dir, "youth-fare-samples.json"), []) or [])
        self.verified = {canonical_airline(e.get("airline")): e for e in _load(os.path.join(set_dir, "bag-fees-verified.json"), []) or []
                         if isinstance(e, dict)}
        self.countries = {}  # city code -> country code, filled in by compose.py

    def fixed(self, airline, leg):
        """Add-on prices an airline publishes as fixed per route group, for this leg: {"cabin", "checked", "basis"},
        each price None where the group's price is not published (or varies by flight). Only SAS publishes such a
        table among the airlines checked (bag-fees-verified.json); the others price bags per flight."""
        e = self.verified.get(airline)
        a, b = self.countries.get(leg.get("fromCity")), self.countries.get(leg.get("toCity"))
        if not e or not a or not b:
            return None
        zone = "domestic" if a == b else "nordic" if a in SCANDINAVIA and b in SCANDINAVIA else "europe" if a in EUROPE and b in EUROPE else None
        if zone is None:
            return None

        def price(block):
            if (block or {}).get("pricing") != "fixed":
                return None
            rng = (block.get("byZoneRangeEUR") or {}).get(zone)
            fixed = (block.get("byZone") or {}).get(zone)
            # where the table has two route-group prices for one zone, use the higher, so a trip is never priced low
            return float(max(rng)) if isinstance(rng, list) and rng else (float(fixed) if fixed is not None else None)

        cabin, checked = price(e.get("addCabin")), price(e.get("addChecked"))
        if cabin is None and checked is None:
            return None
        names = {"domestic": "domestic", "nordic": "within Scandinavia", "europe": "Scandinavia to Europe"}
        return {"cabin": cabin, "checked": checked, "basis": f"{airline} published add-on price, {names[zone]}, bought 14+ days ahead"}

    @staticmethod
    def _sampled_upgrades(samples):
        """Median one-way price of moving to the bag-inclusive fare, per airline, from same-flight samples."""
        # The base is the fare Google prices: KLM/Air France "Light" (cabin bag included) rather than the newer "Basic".
        rank = {"light": 0, "lowfare": 1, "low fare": 1, "basic": 2}
        base, base_rank, upgraded = {}, {}, {}
        for s in samples:
            if not isinstance(s, dict) or s.get("priceEUR") is None or not str(s.get("passengerType", "")).lower().startswith("adult"):
                continue
            airline = canonical_airline(s.get("airline"))
            fare = str(s.get("fareName") or "").lower()
            key = (airline, s.get("route"), s.get("trip"))
            if "standard" in fare or "lowfare+" in fare or "lowfare +" in fare or "classic" in fare:
                upgraded[key] = float(s["priceEUR"])
                continue
            r = next((v for k, v in rank.items() if k in fare and not ("lowfare" in k and "+" in fare)), None)
            if r is not None and r < base_rank.get(key, 99):
                base[key], base_rank[key] = float(s["priceEUR"]), r
        deltas = {}
        for key, up in upgraded.items():
            if key in base and up > base[key]:
                legs = 2 if "round" in str(key[2] or "").lower() else 1
                deltas.setdefault(key[0], []).append((up - base[key]) / legs)
        return {a: round(statistics.median(v), 2) for a, v in deltas.items() if v}

    def policy(self, airline):
        """(cabin_included, checked_included, cabin_add, checked_add, both_add, estimate, basis)"""
        e = self.fees.get(airline) or {}
        budget = airline in BUDGET
        d = BUDGET_DEFAULT if budget else LEGACY_DEFAULT
        inc = e.get("includes") or {"cabinBag": not budget, "checkedBag": False}
        cabin_inc = bool(inc.get("cabinBag"))
        checked_inc = bool(inc.get("checkedBag"))

        def typ(block, fallback):
            if not block:
                return fallback
            for k in ("typicalEUR", "minEUR", "maxEUR"):
                if block.get(k) is not None:
                    return float(block[k])
            return fallback

        cabin = 0.0 if cabin_inc else typ(e.get("addCabin"), d["cabin"])
        checked = 0.0 if checked_inc else typ(e.get("addChecked"), d["checked"])
        both = typ(e.get("addBoth"), None)
        if both is None:
            both = (0.0 if cabin_inc else cabin) + (0.0 if checked_inc else checked)
        sampled = self.sampled.get(airline)
        basis = f"{airline} {'fee' if budget else 'fare'} table" if e else f"typical {'budget' if budget else 'full-service'} airline fee"
        if sampled is not None:
            checked = sampled if not checked_inc else 0.0
            both = sampled if cabin_inc or airline == "Norwegian" else both
            if airline == "Norwegian":
                cabin = min(cabin, sampled) if cabin else sampled
            basis = f"{airline} bag fare sampled on comparable flights"
        return cabin_inc, checked_inc, round(cabin, 2), round(checked, 2), round(both, 2), True, basis


def _sas_upgrade(leg):
    """SAS notes state the Standard fare (adds cabin and checked bag) per direction, e.g. '+200 NOK out / +200 NOK back'."""
    notes = leg.get("notes") or ""
    m = re.search(r"Standard fare[^:]*:\s*\+?(\d+)\s*NOK(?:\s*out\s*/\s*\+?(\d+)\s*NOK\s*back)?", notes)
    if not m:
        return None
    nok = int(m.group(1)) + (int(m.group(2)) if m.group(2) else 0)
    return round(nok / 10.7155, 2)


def leg_bags(leg, fees):
    kind = leg.get("kind") or "flight"
    source = leg.get("source") or ""
    trips = 2 if leg.get("roundTrip") else 1
    if kind != "flight" or source == "flixbus-api":
        free = {"included": True, "addEUR": 0.0, "estimate": False, "basis": "luggage included on trains and buses"}
        return {"cabin": dict(free), "checked": dict(free), "both": {"addEUR": 0.0, "estimate": False, "basis": free["basis"]}}
    if source == "sas":
        delta = _sas_upgrade(leg)
        fam = (leg.get("fareFamily") or "").lower()
        if "standard" in fam or "flex" in fam or "plus" in fam:
            inc = {"included": True, "addEUR": 0.0, "estimate": False, "basis": "included in this SAS fare"}
            return {"cabin": dict(inc), "checked": dict(inc), "both": {"addEUR": 0.0, "estimate": False, "basis": inc["basis"]}}
        if delta is not None:
            # per direction already summed for round trips; compare with the add-on table per direction
            _, _, t_cabin, t_checked, t_both, _, _ = fees.policy("SAS")
            fx = fees.fixed("SAS", leg) or {}
            exact = {"cabin": fx.get("cabin"), "checked": fx.get("checked")}
            exact["both"] = exact["cabin"] + exact["checked"] if exact["cabin"] is not None and exact["checked"] is not None else None
            per_dir = delta / trips
            out = {}
            for key, table in (("cabin", t_cabin), ("checked", t_checked), ("both", t_both)):
                add = exact[key] if exact[key] is not None else table
                if per_dir <= add:
                    out[key] = {"included": False, "addEUR": round(delta, 2), "estimate": False, "basis": "SAS Standard fare on the same flights (adds cabin and checked bag)"}
                elif exact[key] is not None:
                    out[key] = {"included": False, "addEUR": round(add * trips, 2), "estimate": False, "basis": fx["basis"]}
                else:
                    out[key] = {"included": False, "addEUR": round(table * trips, 2), "estimate": True, "basis": "SAS add-on bag price (fee table)"}
            out["both"].pop("included", None)
            return out
    if source == "rome2rio":
        airline = None
    elif source == "ryanair-api":
        airline = "Ryanair"
    elif source == "wizz-api":
        airline = "Wizz Air"
    else:
        airline = first_airline(leg.get("operator"))
    if airline is None:
        cabin_inc, checked_inc, cabin, checked, both, est, basis = False, False, BUDGET_DEFAULT["cabin"], BUDGET_DEFAULT["checked"], BUDGET_DEFAULT["both"], True, "typical budget airline fee (airline not known)"
    else:
        cabin_inc, checked_inc, cabin, checked, both, est, basis = fees.policy(airline)
    missing = " ".join(leg.get("missing") or []).lower()
    if source == "google-flights":
        # Google states per fare whether the overhead bin is included; that beats the airline's cheapest-fare policy
        flagged = "overhead bin" in missing
        if flagged and cabin_inc:
            cabin_inc, cabin = False, BUDGET_DEFAULT["cabin"]
        elif not flagged and not cabin_inc:
            cabin_inc, cabin = True, 0.0
        both = (0.0 if checked_inc else checked) + (0.0 if cabin_inc else cabin) if cabin_inc else max(both, cabin + (0 if checked_inc else checked) * 0.6)
    if cabin_inc and checked_inc:
        both = 0.0
    elif cabin_inc:
        both = checked
    elif checked_inc:
        both = cabin
    est_cabin = est_checked = est
    basis_cabin = basis_checked = basis
    fx = fees.fixed(airline, leg) if airline else None
    if fx:  # a published fixed price for this route group replaces the typical figure
        if not cabin_inc and fx["cabin"] is not None:
            cabin, est_cabin, basis_cabin = fx["cabin"], False, fx["basis"]
        if not checked_inc and fx["checked"] is not None:
            checked, est_checked, basis_checked = fx["checked"], False, fx["basis"]
        both = (0.0 if cabin_inc else cabin) + (0.0 if checked_inc else checked)
    est_both = (est_cabin and not cabin_inc) or (est_checked and not checked_inc)
    return {
        "cabin": {"included": cabin_inc, "addEUR": round(cabin * trips, 2), "estimate": est_cabin and not cabin_inc, "basis": basis_cabin},
        "checked": {"included": checked_inc, "addEUR": round(checked * trips, 2), "estimate": est_checked and not checked_inc, "basis": basis_checked},
        "both": {"addEUR": round(both * trips, 2), "estimate": est_both and both > 0, "basis": basis_cabin if est_cabin else basis_checked},
    }


SCENARIOS = {"none": (False, False), "cabin": (True, False), "checked": (False, True), "both": (True, True)}


def bag_cost(leg, scenario):
    cabin, checked = SCENARIOS[scenario]
    b = leg.get("bags")
    if not b or not (cabin or checked):
        return 0.0
    if cabin and checked:
        return b["both"]["addEUR"] or 0.0
    return (b["cabin"] if cabin else b["checked"])["addEUR"] or 0.0


class Transfers:
    def __init__(self, set_dir, data):
        self.airport, self.local = {}, {}
        paths = sorted(glob.glob(os.path.join(set_dir, "transfers", "*.json")))
        # Rome2Rio estimates first, then researched figures override them wherever they exist
        paths.sort(key=lambda p: 0 if "rome2rio" in os.path.basename(p) else 1)
        for path in paths:
            for c in _load(path, []) or []:
                if not isinstance(c, dict):
                    continue
                city = data.city_of(c.get("city")) or c.get("city")
                if c.get("localTicketEUR") is not None:
                    self.local[city] = float(c["localTicketEUR"])
                for a in c.get("airports") or []:
                    pub, taxi = a.get("public") or {}, a.get("taxi") or {}
                    code = str(a.get("code")).upper()
                    cur = self.airport.setdefault(code, {"public": None, "taxi": None})
                    if pub.get("fareEUR") is not None:
                        cur["public"] = {"eur": float(pub["fareEUR"]), "min": pub.get("minutes"), "mode": pub.get("mode"), "to": pub.get("to"), "hours": pub.get("hours"),
                                         "src": "rome2rio" if "rome2rio" in os.path.basename(path) else "research"}
                        if cur["public"]["min"] is None and pub.get("minutes") is None:
                            cur["public"]["min"] = 45
                    if taxi.get("fareEUR") is not None:
                        cur["taxi"] = {"eurPerCar": float(taxi["fareEUR"]), "min": taxi.get("minutes"), "capacity": int(taxi.get("capacity") or 4), "basis": taxi.get("basis")}
        # destinations.json has one researched figure per airport; it beats Rome2Rio's rough estimates
        for d in data.dest.values():
            for a in d["airports"]:
                code = str(a.get("code")).upper()
                cur = self.airport.setdefault(code, {"public": None, "taxi": None})
                weak = cur["public"] is None or cur["public"].get("src") == "rome2rio"
                if weak and a.get("transferEUR") is not None:
                    cur["public"] = {"eur": float(a["transferEUR"]), "min": a.get("transferMin"), "mode": a.get("transferMode"), "to": "city centre",
                                     "hours": None, "src": "destinations"}
        self.station = {}
        self.fixed_codes = set()
        self._load_details(set_dir, data)  # the exact services researched last override all of the above
        for info in self.airport.values():
            if info["public"]:
                info["public"].pop("src", None)
        self.data = data

    def _load_details(self, set_dir, data):
        """Exact services per airport and station, researched in transfers-detail/: the line, where it stops, the fare."""
        def num(v):
            try:
                return float(v)
            except (TypeError, ValueError):
                return None

        remark = re.compile(r"not stated|not verified|unverified|not confirmed|not found|not sourced|per wikivoyage|wikivoyage suggests|search summar|airport page", re.I)
        source_tail = re.compile(r"\s+(?:per|from|according to|as listed on)\s+(?:the\s+)?(?:wikivoyage|airport|official|operator|website|search|tourism)[^;,]*", re.I)

        def tidy(text, notes, fare=False):
            """'Bus 2 (operator not stated); runs often' -> 'Bus 2': one clean phrase, the rest kept in notes."""
            if not isinstance(text, str) or not text.strip():
                return None
            notes.extend(f.strip() for f in re.findall(r"\(([^()]*)\)", text) if f.strip())
            parts = [s.strip(" ,;") for s in re.sub(r"\s*\([^()]*\)", "", text).split(";") if s.strip(" ,;")]
            if fare:  # a fare's first phrase is the fare, even when it names its source
                keep = [source_tail.sub("", parts[0]).strip(" ,;")] if parts else []
                notes.extend(parts[1:])
            else:
                keep = [s for s in parts if not remark.search(s)][:1]
                notes.extend(s for s in parts if s not in keep)
            return (keep[0][:120] if keep and keep[0] else None)

        def mode_of(line):
            t = (line or "").lower()
            hits = [(t.find(word), mode) for word, mode in (("metro", "metro"), ("tram", "tram"), ("train", "train"), ("rail", "train"),
                                                             ("bus", "bus"), ("shuttle", "shuttle bus"), ("ferry", "ferry"), ("walk", "walk"))
                    if word in t]
            return min(hits)[1] if hits else "public transport"

        for path in sorted(glob.glob(os.path.join(set_dir, "transfers-detail", "result-T*.json"))):
            for c in _load(path, []) or []:
                if not isinstance(c, dict):
                    continue
                city = data.city_of(c.get("city")) or c.get("city")
                for a in c.get("airports") or []:
                    code = str(a.get("code") or "").upper()
                    if not code:
                        continue
                    cur = self.airport.setdefault(code, {"public": None, "taxi": None})
                    pub = a.get("public") or {}
                    notes = []
                    extra = {"line": tidy(pub.get("line"), notes), "from": tidy(pub.get("from"), notes), "to": tidy(pub.get("to"), notes),
                             "freq": tidy(pub.get("frequency"), notes), "url": pub.get("url"), "fareText": tidy(pub.get("fareText"), notes, fare=True)}
                    extra["note"] = "; ".join(dict.fromkeys(notes))[:220] or None
                    if num(pub.get("fareEUR")) is not None:
                        cur["public"] = {"eur": num(pub["fareEUR"]), "min": num(pub.get("minutes")) or 45, "mode": mode_of(pub.get("line")),
                                         "hours": pub.get("hours"), **{k: v for k, v in extra.items() if v}}
                        if pub.get("estimate"):  # a typical fare filled in by hand where the agent found the service but no price
                            cur["public"]["estimate"] = True
                    elif cur["public"] and pub.get("line"):  # the service is known but its fare is not: keep the earlier figure, marked
                        notes.append(f"fare from an earlier estimate ({cur['public'].get('mode') or 'public transport'}), not checked for this service")
                        extra["note"] = "; ".join(dict.fromkeys(notes))[:220]
                        cur["public"] = {**cur["public"], **{k: v for k, v in extra.items() if v}, "mode": mode_of(pub.get("line")), "estimate": True}
                    taxi = a.get("taxi") or {}
                    if num(taxi.get("fareEUR")) is not None:
                        cur["taxi"] = {"eurPerCar": num(taxi["fareEUR"]), "min": num(taxi.get("minutes")), "capacity": 4, "basis": taxi.get("basis"),
                                       **({"url": taxi["url"]} if taxi.get("url") else {})}
                entries = []
                for st in c.get("stations") or []:
                    if not isinstance(st, dict):
                        continue
                    notes = []
                    fare = num(st.get("fareEUR"))
                    walking = "walk" in str(st.get("toCentre") or "").lower() and not st.get("line")
                    entries.append({"eur": 0.0 if walking else fare, "min": num(st.get("minutes")) or STATION_MINUTES,
                                    "mode": "walk" if walking else mode_of(st.get("line")), "line": tidy(st.get("line"), notes),
                                    "to": tidy(st.get("toCentre"), notes), "name": tidy(st.get("name"), notes), "url": st.get("url"),
                                    "serves": f"{st.get('serves') or ''} {st.get('name') or ''}".lower(),
                                    "note": "; ".join(dict.fromkeys(notes))[:200] or None})
                if entries:
                    self.station[city] = entries

    def airport_transfer(self, code, city):
        code = (code or "").upper()
        home = self.data.city_of(code) if code else None
        if code and city and home and home != city:
            # another city's airport (Vienna for Bratislava): the ride from it to this city, as the destination lists it
            d = self.data.dest.get(city) or {}
            entry = next((a for a in d.get("airports") or [] if str(a.get("code") or "").upper() == code), None)
            if entry and entry.get("transferEUR") is not None:
                mode = entry.get("transferMode") or "bus"
                name = entry.get("name") or code
                checked = bool(entry.get("transferChecked"))  # the fare was looked up with the operator
                pub = {"eur": float(entry["transferEUR"]), "min": entry.get("transferMin") or 60, "mode": mode,
                       "line": entry.get("transferLine") or f"{mode[0].upper()}{mode[1:]} to {d.get('name') or city}",
                       "from": name, "to": f"{d.get('name') or city} centre", "estimate": not checked,
                       "note": f"{name} is the nearest airport with flights from home; "
                               + (entry.get("transferNote") or "the fare is the research figure, not checked with the operator")}
                if entry.get("transferUrl"):
                    pub["url"] = entry["transferUrl"]
                return {"where": city, "kind": "airport", "place": code, "public": pub, "taxi": None}
        info = self.airport.get(code)
        if not info:
            d = self.data.dest.get(city)
            if d and d["airports"]:
                code = str(d["airports"][0]["code"]).upper()
                info = self.airport.get(code)
        if not info:
            return {"where": city, "kind": "airport", "place": code or None, "public": None, "taxi": None}
        return {"where": city, "kind": "airport", "place": code, "public": info["public"], "taxi": info["taxi"]}

    def station_transfer(self, city, kind=None):
        entries = self.station.get(city) or []
        want = r"bus|flix|coach" if kind and "bus" in kind and "train" not in kind else r"train|rail|station|bahnhof|gare|stazione|dworzec" if kind and "train" in kind else None
        info = next((e for e in entries if want and re.search(want, e["serves"])), entries[0] if entries else None)
        if info:
            eur = info["eur"] if info["eur"] is not None else self.local.get(city, LOCAL_TICKET_DEFAULT)
            pub = {"eur": eur, "min": info["min"], "mode": info["mode"], "to": info["to"], "hours": None,
                   **{k: info[k] for k in ("line", "url", "note") if info.get(k)}}
            if info["eur"] is None and info["mode"] != "walk":
                pub["fareText"] = "one local ticket"
            return {"where": city, "kind": "station", "place": info.get("name"), "public": pub, "taxi": None}
        t = self.local.get(city)
        mode = "local transit ticket" if t is not None else "local transit (typical ticket price)"
        pub = {"eur": t if t is not None else LOCAL_TICKET_DEFAULT, "min": STATION_MINUTES, "mode": mode, "to": "the station", "hours": None}
        return {"where": city, "kind": "station", "place": None, "public": pub, "taxi": None}

    def for_leg(self, leg, origin):
        frm, to = leg["fromCity"], leg["toCity"]
        if (leg.get("kind") or "flight") != "flight":
            return [self.station_transfer(frm, leg.get("kind")), self.station_transfer(to, leg.get("kind"))]
        def code_for(raw, city):
            if city == origin or city in self.fixed_codes:  # home airports carry their own fixed transfer
                return city
            raw = str(raw or "").upper()
            return raw if raw and raw != city else None

        dep_code, arr_code = code_for(leg.get("from"), frm), code_for(leg.get("to"), to)
        out = [self.airport_transfer(dep_code, frm), self.airport_transfer(arr_code, to)]
        if leg.get("roundTrip"):  # the same airports again on the way home
            out += [self.airport_transfer(arr_code, to), self.airport_transfer(dep_code, frm)]
        return out


def transfer_pp(t, n, pref="cheapest"):
    """Per-person cost and minutes of one transfer for a party of n."""
    pub = t.get("public")
    taxi = t.get("taxi")
    taxi_pp = (math.ceil(n / max(1, taxi["capacity"])) * taxi["eurPerCar"] / n) if taxi else None
    if pref == "public" and pub:
        return pub["eur"], pub.get("min") or 0
    if pref == "taxi" and taxi:
        return taxi_pp, taxi.get("min") or 0
    options = [(pub["eur"], pub.get("min") or 0)] if pub else []
    if taxi:
        options.append((taxi_pp, taxi.get("min") or 0))
    if not options:
        return 0.0, 0
    return min(options)


def transfers_pp(leg, n, pref="cheapest"):
    total, minutes = 0.0, 0
    for t in leg.get("transfers") or []:
        c, m = transfer_pp(t, n, pref)
        total += c or 0.0
        minutes += m or 0
    return total, minutes
