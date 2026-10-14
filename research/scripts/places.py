"""City facts that do not depend on a research set: typical weather through the year (climate.py), everyday
prices such as a meal or a beer (prices.py), local tips and entry rules for Norwegian citizens (research agents). They live in research/places/ and every research set reuses them.
The registry places/cities.json lists every city a set uses, plus home cities that prices are compared against.
  py -3 -X utf8 -I research/scripts/places.py --registry   add the destinations of every set folder to the registry
  py -3 -X utf8 -I research/scripts/places.py              compose places/places.json, the file the app loads"""
import argparse
import os
import statistics
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT, load_json, save_json  # noqa: E402

PLACES = ROOT / "places"
HOME = [{"code": "TRD", "name": "Trondheim", "country": "Norway", "cc": "NO", "lat": 63.4305, "lon": 10.3951, "home": True}]


def registry():
    return load_json(PLACES / "cities.json", [])


def sync_registry():
    reg = {c["code"]: c for c in registry()}
    added = []
    for folder in sorted(p for p in ROOT.iterdir() if (p / "destinations.json").exists()):
        for d in load_json(folder / "destinations.json"):
            if d["code"] not in reg:
                added.append(d["code"])
            cur = reg.setdefault(d["code"], {})
            for k in ("code", "name", "country", "cc", "lat", "lon"):
                if cur.get(k) is None:
                    cur[k] = d.get(k)
    for h in HOME:
        reg.setdefault(h["code"], dict(h))
    save_json(PLACES / "cities.json", sorted(reg.values(), key=lambda c: (bool(c.get("home")), c["code"])))
    print(f"registry: {len(reg)} cities, added {len(added)}: {' '.join(added)}")


FIELDS = ["mealCheap", "mealMid2", "fastFood", "beerBar", "beerShop", "cappuccino", "transit", "wine"]
# cities without a price page of their own borrow a similar city's prices, and say so
PRICE_PROXY = {"FUE": ("LPA", "Prices from Las Palmas, the nearest city with price data (same Canary Islands province).")}
# caveats a reviewer found that apply to a whole country's prices
COUNTRY_NOTES = {"ES": "Spanish bars mostly pour a caña (about 0.25 l), and the bar-beer price here probably is one; "
                       "a 0.5 l jarra costs more."}
DISAGREE = 0.3  # sources more than 30% apart get a second look (places/raw/price-review.json)


def calibration(nb, lc):
    """Median Numbeo / LivingCost ratio per item over the cities both cover: LivingCost values are scaled by it."""
    out = {}
    for f in FIELDS:
        r = [nb[c]["items"][f]["eur"] / lc[c]["items"][f]["eur"] for c in nb if c in lc and f in nb[c].get("items", {})
             and f in lc[c].get("items", {}) and lc[c]["items"][f]["eur"] > 0 and nb[c]["items"][f]["eur"] > 0]
        out[f] = round(statistics.median(r), 3) if len(r) >= 10 else 1.0
    return out


def merge_prices(codes, prices, research, reg_cc=None):
    nb, lc = prices.get("numbeo", {}), prices.get("livingcost", {})
    ratio = calibration(nb, lc)
    out, review = {}, []
    for code in codes:
        if code in PRICE_PROXY:  # composed in the second pass, from the city it borrows from
            continue
        n_items = nb.get(code, {}).get("items", {})
        l_items = lc.get(code, {}).get("items", {})
        items = {}
        for f in FIELDS:
            n, l = n_items.get(f), l_items.get(f)
            scaled = round(l["eur"] * ratio[f], 2) if l else None
            if n:
                items[f] = {"eur": n["eur"], "src": "numbeo"}
                if n.get("low") is not None:
                    items[f].update(low=n["low"], high=n["high"])
                if scaled and n["eur"] > 0 and abs(n["eur"] / scaled - 1) > DISAGREE:
                    review.append({"city": code, "item": f, "numbeo": n["eur"], "livingcostScaled": scaled,
                                   "numbeoEntries": nb[code].get("entries"), "fromBeerList": bool(nb[code].get("fromList"))})
            elif scaled is not None:
                items[f] = {"eur": scaled, "src": "livingcost"}
        apply_research(items, research.get(code))
        if not items:
            continue
        rec = {"items": items, "sources": []}
        cc = (reg_cc or {}).get(code)
        if cc in COUNTRY_NOTES and items.get("beerBar", {}).get("src") != "research":  # the caveat is about Numbeo's bar beer
            rec["note"] = COUNTRY_NOTES[cc]
        if code in nb:
            rec["sources"].append({"name": "Numbeo", "url": nb[code]["url"], "updated": nb[code].get("updated"),
                                   "entries": nb[code].get("entries"), "contributors": nb[code].get("contributors"),
                                   "partial": bool(nb[code].get("fromList"))})
        if code in lc:
            rec["sources"].append({"name": "LivingCost.org", "url": lc[code]["url"], "updated": lc[code].get("updated")})
        out[code] = rec
    for code, (src_code, note) in PRICE_PROXY.items():  # second pass: borrow from a city composed above
        if code in codes and src_code in out:
            items = {k: dict(v) for k, v in out[src_code]["items"].items()}
            apply_research(items, research.get(code))
            if "beerBar" in (research.get(code) or {}):
                note += " Bar beer was checked for this place itself."
            out[code] = {"items": items, "sources": out[src_code]["sources"], "note": note}
    return out, ratio, review


def apply_research(items, fields):
    """Corrections from review agents replace an item, with their note and source; a price scaled from a smaller pour
    (a 0.25 l caña doubled to 0.5 l) keeps what was actually found."""
    for f, r in (fields or {}).items():
        if f in FIELDS and r.get("eur") is not None:
            items[f] = {"eur": round(float(r["eur"]), 2), "src": "research", "note": r.get("note"), "url": r.get("url")}
            if r.get("scaled") and r.get("measuredLitres") and r.get("measuredEUR") is not None:
                items[f]["scaledFrom"] = {"litres": float(r["measuredLitres"]), "eur": round(float(r["measuredEUR"]), 2)}


def food_day(items):
    """A day of eating out: a cheap lunch, a mid-range dinner (half a meal for two) and a cappuccino."""
    need = ("mealCheap", "mealMid2", "cappuccino")
    return round(items["mealCheap"]["eur"] + items["mealMid2"]["eur"] / 2 + items["cappuccino"]["eur"], 2) if all(k in items for k in need) else None


def compose():
    reg = registry()
    climate = load_json(PLACES / "climate.json", {}) or {}
    prices = load_json(PLACES / "prices.json", {}) or {}
    research = {}
    for f in sorted(PLACES.glob("prices-research*.json")):  # corrections from review agents, each with a source
        for code, fields in ((load_json(f, {}) or {}).get("cities") or {}).items():
            research.setdefault(code, {}).update(fields)
    tips = {}
    for f in sorted(PLACES.glob("tips-*.json")):  # tips-H* from the first agents, tips-R* corrections on top, field by field
        for code, rec in ((load_json(f, {}) or {}).get("cities") or {}).items():
            tips.setdefault(code, {}).update({k: v for k, v in (rec or {}).items() if v not in (None, [], "")})
    countries = {}
    for f in sorted(PLACES.glob("entry-*.json")):  # entry rules for Norwegian citizens, later files correct earlier ones
        for cc, rec in ((load_json(f, {}) or {}).get("countries") or {}).items():
            keep = ("name", "level", "idCard", "paperwork", "costEUR", "applyDaysAhead", "stayDays", "passport", "atBorder", "url", "notes")
            countries.setdefault(cc.upper(), {}).update({k: rec[k] for k in keep if rec.get(k) is not None})
    merged, ratio, review = merge_prices([c["code"] for c in reg], prices, research, {c["code"]: c.get("cc") for c in reg})
    dest = [c["code"] for c in reg if not c.get("home")]
    beer = [merged[c]["items"]["beerBar"]["eur"] for c in dest if c in merged and "beerBar" in merged[c]["items"]]
    days = [d for d in (food_day(merged[c]["items"]) for c in dest if c in merged) if d]
    beer_mid, day_mid = statistics.median(beer), statistics.median(days)
    for rec in merged.values():
        it = rec["items"]
        if "beerBar" in it:
            rec["beerIndex"] = round(it["beerBar"]["eur"] / beer_mid * 100)
        d = food_day(it)
        if d:
            rec["foodDayEUR"] = d
            rec["foodIndex"] = round(d / day_mid * 100)
    cities = {}
    for c in reg:
        rec = {k: c.get(k) for k in ("code", "name", "country", "cc", "lat", "lon") if c.get(k) is not None}
        if c.get("home"):
            rec["home"] = True
        cl = (climate.get("cities") or {}).get(c["code"])
        if cl:
            rec["climate"] = {"periods": cl["periods"], "years": cl.get("years"), "decemberYears": cl.get("decemberYears"), "link": cl.get("link")}
        if c["code"] in merged:
            rec["prices"] = merged[c["code"]]
        if c["code"] in tips:
            rec["tips"] = tips[c["code"]]
        cities[c["code"]] = rec
    out = {
        "schema": 1, "kind": "places", "generated": time.strftime("%Y-%m-%d"),
        "home": next((c["code"] for c in reg if c.get("home")), None),
        "climate": {k: climate.get(k) for k in ("source", "sourceUrl", "years", "note", "periods", "generated")} if climate else None,
        "prices": {"fetched": prices.get("fetched"), "sources": prices.get("sources"), "ratios": ratio,
                   "beerMedianEUR": round(beer_mid, 2), "foodDayMedianEUR": round(day_mid, 2),
                   "index": f"100 = the median of the {len(dest)} destinations",
                   "foodDay": "a cheap lunch, a mid-range dinner (half of a three-course meal for two, no drinks) and a cappuccino",
                   "beer": "0.5 l of local draught beer in a bar"},
        "cities": cities,
        "countries": countries,
    }
    save_json(PLACES / "places.json", out)
    save_json(PLACES / "raw" / "price-review.json", review)
    src = {}
    for rec in merged.values():
        for v in rec["items"].values():
            src[v["src"]] = src.get(v["src"], 0) + 1
    print(f"places.json: {len(cities)} cities, climate {sum(1 for v in cities.values() if v.get('climate'))}, "
          f"prices {len(merged)} (values by source {src}), tips {len(tips)}, entry rules {len(countries)} countries; {len(review)} values flagged for review")
    print(f"medians: beer {beer_mid:.2f}, food day {day_mid:.2f}; ratios {ratio}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", action="store_true")
    args = ap.parse_args()
    if args.registry:
        sync_registry()
    else:
        compose()
