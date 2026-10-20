"""Refresh legs/sas.json from fresh SAS offers read in the browser (flysas.com's own offers API).

Input: raw/sas/refresh-<date>.json, {"FROM-TO-YYYYMMDD-adult|youth": {"s": status, "c": currency, "o": [itinerary, ...]}}
with itinerary = [flights "SK361 SK811", light NOK, standard NOK, dep HH:MM, arrival local ISO, minutes, stops,
via "OSL:55", seats left, operating carriers]. Each existing SAS leg keeps its flights when they are still on sale
(new price, new Standard upgrade, new seat count) and moves to the cheapest flight of that day when they are not.
A direction with nothing on sale drops the leg. Run: py -3 -X utf8 -I research/scripts/sas_refresh.py raw/sas/refresh-2026-10-20.json
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SET, CAPTURED, to_eur, load_json, save_json  # noqa: E402

FLIGHT = re.compile(r"\b([A-Z0-9]{2}\d{2,4}) [A-Z]{3}-[A-Z]{3} ")


def old_flights(note, rt):
    """Flight numbers per direction as the old note states them."""
    note = re.split(r"Standard fare|Window check", note)[0]
    if rt:
        out, _, back = note.partition("Back ")
        return " ".join(FLIGHT.findall(out)), " ".join(FLIGHT.findall(back))
    return " ".join(FLIGHT.findall(note)), None


def pick(res, key, want, standard):
    """(itinerary, same_flights) for a direction: the old flights when still on sale, else the cheapest."""
    r = res.get(key)
    if not r or not r["o"]:
        return None, False
    def price(it):
        return it[2] if standard and it[2] is not None else it[1] if it[1] is not None else it[2]

    ok = [it for it in r["o"] if it[1] is not None or it[2] is not None]
    if want:
        same = [it for it in ok if f" {it[0]} " in f" {want} "]
        if same:
            return min(same, key=price), True
    return min(ok, key=price), False


def main(path):
    res = load_json(path, {})
    legs = load_json(SET / "legs" / "sas.json", [])
    out, dropped, moved, kept = [], 0, 0, 0
    for l in legs:
        fam = l["fareType"]
        rt = l["roundTrip"]
        standard = "Standard" in l["fareFamily"].split(" / ")[0] if "(out)" not in l["fareFamily"] else False
        fo, fb = old_flights(l["notes"], rt)
        k1 = f"{l['from']}-{l['to']}-{l['date'].replace('-', '')}-{fam}"
        k2 = f"{l['to']}-{l['from']}-{l['returnDate'].replace('-', '')}-{fam}" if rt else None
        a, same_a = pick(res, k1, fo, standard)
        b, same_b = pick(res, k2, fb, standard) if rt else (None, True)
        if a is None or (rt and b is None):
            dropped += 1
            continue
        cur = res[k1].get("c") or "NOK"

        def p(it):
            return it[2] if (standard and it[2] is not None) or it[1] is None else it[1]

        def up(it):
            return (it[2] - it[1]) if it[1] is not None and it[2] is not None else None

        total = p(a) + (p(b) if rt else 0)
        n = dict(l)
        n["priceOriginal"] = total
        n["currencyOriginal"] = cur
        n["priceEUR"] = to_eur(total, cur)
        n["capturedAt"] = CAPTURED
        if not standard and (a[1] is None or (rt and b[1] is None)):
            # no Light fare on sale any more: the Standard fare is the price, and it includes the bags
            n["fareFamily"] = "SAS Standard"
            n["includes"] = ["1 underseat bag (40x30x15 cm)", "1 x 8 kg carry-on bag (55x40x23 cm)", "1 x 23 kg checked bag", "rebooking for a fee"]
            n["missing"] = ["refund", "free seat selection (not listed on the fare card)"]
        if not (same_a and same_b):
            moved += 1
            n["depTime"] = a[3]
            n["arrTime"] = a[4][11:16]
            n["arrDate"] = a[4][:10]
            n["durationMin"] = a[5]
            n["stops"] = a[6]
            n["via"] = [v.split(":")[0] for v in a[7].split("/") if v]
            n["layoverMin"] = int(a[7].split("/")[0].split(":")[1]) if a[7] else 0
            if rt:
                n["durationBackMin"] = b[5]
        else:
            kept += 1
        ua, ub = up(a), (up(b) if rt else None)
        txt = f"{'round-trip total' if rt else 'one-way'} {total} {cur} = outbound {p(a)}" + (f" + return {p(b)}" if rt else "")
        txt += f". Out {l['date']}: {a[0]} dep {a[3]}, arr {a[4][5:16].replace('T', ' ')} [{a[5] // 60}h{a[5] % 60:02d}, {a[6]} stop(s) {a[7] or 'direct'}" \
               f"{', seats left at price: ' + str(a[8]) if a[8] is not None else ''}]"
        if rt:
            txt += f". Back {l['returnDate']}: {b[0]} dep {b[3]}, arr {b[4][5:16].replace('T', ' ')} [{b[5] // 60}h{b[5] % 60:02d}, {b[6]} stop(s) {b[7] or 'direct'}" \
                   f"{', seats left at price: ' + str(b[8]) if b[8] is not None else ''}]"
        if ua is not None and (not rt or ub is not None):
            txt += f". Standard fare (adds 8 kg cabin bag + 23 kg checked bag) on the same flight{'s' if rt else ''}: +{ua} {cur} out" + (f" / +{ub} {cur} back" if rt else "")
        txt += f". Re-read on flysas.com on {CAPTURED}" + ("" if (same_a and same_b) else "; the 11 Oct flight is no longer on sale, so this is the cheapest flight that day")
        if fam == "youth":
            txt += ". youth fare: booking requires login with a EuroBonus account and age 12-25."
        n["notes"] = txt
        out.append(n)
    save_json(SET / "legs" / "sas.json", out)
    print(f"legs {len(legs)} -> {len(out)}; same flights {kept}, moved to another flight {moved}, dropped {dropped}")


if __name__ == "__main__":
    main(sys.argv[1])
