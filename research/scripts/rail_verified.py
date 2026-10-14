"""Rail, coach and ferry fares checked by hand turned into legs that replace Rome2Rio's ranges.
ground-fares-verified.json holds web research; ground-fares-browser.json holds fares read on the operators' own sites
for the travel dates, and its rows replace the researched row for the same pair.
A fixed tariff becomes one undated leg; prices per date become one leg per date plus an undated leg spanning them (left
out when the dates are the only departures); a typical range stays a range, now from the operator. A ferry cabin is
priced per cabin plus a per-person surcharge, which the app splits by party size. Writes legs/rail-verified.json;
compose.py drops each Rome2Rio leg named in "replaces". Run: py -3 -X utf8 -I research/scripts/rail_verified.py"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SET, CAPTURED, load_json, save_json

PARTY = 3  # the party size a cabin leg's priceEUR assumes; the app reprices it for the chosen size


def main():
    browser = load_json(SET / "ground-fares-browser.json", [])
    researched = {(r.get("from"), r.get("to")): r for r in load_json(SET / "ground-fares-verified.json", [])}
    for b in browser:
        old_row = researched.pop((b.get("from"), b.get("to")), None)
        if old_row and not b.get("legId"):
            b["legId"] = old_row.get("legId")
    rows = list(researched.values()) + browser
    r2r = {l["id"]: l for l in load_json(SET / "legs" / "rome2rio.json", [])}
    legs = []
    for r in rows:
        fare = r.get("fare") or {}
        old = r2r.get(r.get("legId")) or {}
        if not fare or not r.get("from") or not r.get("to"):
            continue
        # the app draws trains, buses and flights; a ferry keeps Rome2Rio's ground mode and says "ferry" in its operator
        mode = str(r.get("mode") or "")
        kind = mode if mode in ("train", "bus", "train+bus") else old.get("kind") or "train"
        operator = (r.get("operator") or "").split(";")[0].strip()[:60] or None  # "PKP Intercity (IC, EC, TLK)"; detail stays in notes
        if "ferry" in mode and operator and "ferry" not in operator.lower():
            operator = f"{operator} (ferry)"
        if fare.get("type") == "typical" and fare.get("minEUR") is not None and fare.get("maxEUR") is None:
            # only a "from" price was found: keep Rome2Rio's upper end so the range stays honest, or keep Rome2Rio's leg
            hi = old.get("priceMaxEUR")
            if not hi or hi <= float(fare["minEUR"]):
                continue
            fare = {**fare, "maxEUR": hi}
        notes = "; ".join(x for x in (r.get("service"), fare.get("text"), r.get("notes")) if x)
        base = {"kind": kind, "from": r["from"], "to": r["to"], "fromCity": r["from"], "toCity": r["to"], "returnDate": None, "roundTrip": False,
                "operator": operator, "stops": 0, "via": [], "durationMin": r.get("durationMin"), "durationBackMin": None,
                "layoverMin": None, "overnight": False, "priceMaxEUR": None, "url": fare.get("url"), "source": "rail-research",
                "includes": ["luggage"], "missing": [], "capturedAt": CAPTURED, "notes": notes[:400], "replaces": r.get("legId"),
                "confidence": r.get("confidence"), "overnight": bool(r.get("overnight")), "checkedAt": r.get("checkedAt")}
        group = f"rail-{r['from']}-{r['to']}"
        t = fare.get("type")
        if t == "fixed" and fare.get("eur") is not None:
            legs.append({**base, "id": f"rail-{r['from']}-{r['to']}", "date": None, "priceEUR": float(fare["eur"])})
        elif t == "per-date" and fare.get("byDate"):
            prices = {d: float(v) for d, v in fare["byDate"].items() if v is not None}
            only = bool(fare.get("onlyDates"))  # a weekly ferry: no departure on the other days
            for d, v in sorted(prices.items()):
                legs.append({**base, "id": f"{group}-{d}", "date": d, "priceEUR": v, "group": group, "datesOnly": only})
            if prices and not only:
                lo, hi = min(prices.values()), max(prices.values())
                legs.append({**base, "id": group, "date": None, "priceEUR": lo, "priceMaxEUR": hi if hi > lo else None, "group": group, "span": True})
        elif t == "cabin" and fare.get("byDate"):
            # a cabin for up to `berths` plus a surcharge per person; priceEUR is the share for a party of PARTY
            pp = {}
            for d, c in sorted(fare["byDate"].items()):
                cabin = {"eur": float(c["cabinEUR"]), "berths": int(c.get("berths") or 4), "perPersonEUR": float(c.get("perPersonEUR") or 0), "name": c.get("cabinName")}
                pp[d] = round(cabin["eur"] * -(-PARTY // cabin["berths"]) / PARTY + cabin["perPersonEUR"], 2)
                legs.append({**base, "id": f"{group}-{d}", "date": d, "priceEUR": pp[d], "cabin": cabin, "group": group})
            if pp:
                lo, hi = min(pp.values()), max(pp.values())
                legs.append({**base, "id": group, "date": None, "priceEUR": lo, "priceMaxEUR": hi if hi > lo else None, "group": group, "span": True})
        elif t == "typical" and fare.get("minEUR") is not None:
            lo = float(fare["minEUR"])
            hi = float(fare["maxEUR"]) if fare.get("maxEUR") is not None else None
            legs.append({**base, "id": f"rail-{r['from']}-{r['to']}", "date": None, "priceEUR": lo, "priceMaxEUR": hi if hi and hi > lo else None})
    save_json(SET / "legs" / "rail-verified.json", legs)
    print(f"{len(legs)} legs from {len(rows)} checked fares, replacing {len({l['replaces'] for l in legs if l.get('replaces')})} Rome2Rio legs")


if __name__ == "__main__":
    main()
