"""Collect things-to-do candidates for each destination from English Wikivoyage (CC BY-SA): every See, Do, Eat, Drink
and market listing in the city article and its district subpages, plus any line that mentions December, Christmas
or winter events. Agents then pick, check and price a short list per city (activities/curated-*.json).
Writes 2026-12-europe/activities/candidates/<CODE>.json.
Run: py -3 -X utf8 -I research/scripts/wikivoyage.py [CODE ...]"""
import json
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SET, get, load_json, save_json  # noqa: E402

API = "https://en.wikivoyage.org/w/api.php"
UA = {"User-Agent": "TripFinderResearch/1.0 (https://trip-finder-europe.netlify.app; personal trip planner) python-urllib/3"}
OUT = SET / "activities" / "candidates"
TITLES = {"MLA": "Valletta", "LPA": "Las Palmas de Gran Canaria", "FNC": "Funchal", "REK": "Reykjavík", "PMI": "Palma de Mallorca",
          "RAK": "Marrakech", "LUX": "Luxembourg City", "SGN": "Ho Chi Minh City", "HER": "Heraklion"}
EXTRA = {"TCI": ["Santa Cruz de Tenerife", "Puerto de la Cruz"], "MLA": ["Sliema", "St. Julian's"], "LCA": ["Ayia Napa"]}
LISTING = re.compile(r"\{\{\s*(see|do|eat|drink|buy|listing)\s*(?=\||\}\})", re.I)
HEADING = re.compile(r"^(={2,4})\s*(.+?)\s*\1\s*$", re.M)
DECEMBER = re.compile(r"December|Christmas|Advent|Xmas|Nicholas|Lucia|Hanukkah|Krampus|winter festival|ice rink|skating|mulled|New Year", re.I)
KEEP_TEMPLATES = {"nowrap", "nobr", "small", "lang", "smaller", "big"}
LIMITS = {"see": 28, "do": 20, "drink": 14, "eat": 12, "buy": 5}
BOOSTS = {"see": r"museum|castle|cathedral|palace|gallery|old town|viewpoint|church|basilica|market",
          "do": r"bath|spa|sauna|tour|class|ice|rink|skat|concert|opera|football|stadium|match|crawl|club|market|festival|christmas|walk|hike|boat|thermal",
          "drink": r"club|bar|pub|beer|craft|ruin|nightlife|party|cocktail|wine|brew|student|live music|dance",
          "eat": r"market|food hall|street food|tour|traditional|local|cheap|budget|bakery|pastry|tapas",
          "buy": r"christmas|market|fair"}


def api(params):
    status, body = get(API + "?" + urllib.parse.urlencode({**params, "format": "json", "formatversion": 2}), headers=UA, timeout=120, sleep=0.6)
    if status != 200:
        raise SystemExit(f"Wikivoyage API HTTP {status}")
    return json.loads(body)


def contents(titles):
    """Wikitext for many titles (8 per request), following redirects. Returns {requested title: (resolved title, text)}."""
    out = {}
    for i in range(0, len(titles), 8):
        chunk = titles[i:i + 8]
        q = api({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "redirects": 1, "titles": "|".join(chunk)})["query"]
        alias = {}
        for kind in ("normalized", "redirects"):
            for r in q.get(kind, []):
                alias[r["from"]] = r["to"]
        pages = {p["title"]: p for p in q.get("pages", [])}
        for t in chunk:
            r = t
            while r in alias:
                r = alias[r]
            p = pages.get(r)
            if p and not p.get("missing") and p.get("revisions"):
                out[t] = (r, p["revisions"][0]["slots"]["main"]["content"])
    return out


def subpages(title):
    q = api({"action": "query", "list": "allpages", "apprefix": title + "/", "apnamespace": 0, "aplimit": 100, "apfilterredir": "nonredirects"})
    return [p["title"] for p in q["query"]["allpages"]]


def split_top(s, sep="|"):
    """Split template parameters on top-level pipes, leaving nested templates and links intact."""
    parts, cur = [], []
    depth_t = depth_l = 0
    i = 0
    while i < len(s):
        two = s[i:i + 2]
        if two == "{{":
            depth_t += 1
        elif two == "}}" and depth_t:
            depth_t -= 1
        elif two == "[[":
            depth_l += 1
        elif two == "]]" and depth_l:
            depth_l -= 1
        if two in ("{{", "}}", "[[", "]]"):
            cur.append(two)
            i += 2
            continue
        if s[i] == sep and not depth_t and not depth_l:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(s[i])
        i += 1
    parts.append("".join(cur))
    return parts


def end_of_template(text, start):
    depth, i = 0, start
    while i < len(text) - 1:
        if text[i:i + 2] == "{{":
            depth += 1
            i += 2
            continue
        if text[i:i + 2] == "}}":
            depth -= 1
            i += 2
            if depth == 0:
                return i
            continue
        i += 1
    return len(text)


def _template(m):
    parts = split_top(m.group(1))
    name = parts[0].strip().lower()
    return "|".join(p for p in parts[1:] if "=" not in p) if name in KEEP_TEMPLATES else ""


def plain(s):
    """Wiki markup to plain text: keep link labels and simple formatting templates, drop the rest."""
    for _ in range(4):
        s2 = re.sub(r"\{\{((?:(?!\{\{|\}\}).)*)\}\}", _template, s, flags=re.S)
        if s2 == s:
            break
        s = s2
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", s)
    s = re.sub(r"\[https?://\S+\]", "", s)
    s = s.replace("'''", "").replace("''", "")
    s = re.sub(r"<ref[^>]*>.*?</ref>|<[^>]+>", "", s, flags=re.S)
    return re.sub(r"\s+", " ", s).strip()


def section_for(heads, pos):
    h2 = h3 = ""
    for start, level, name in heads:
        if start > pos:
            break
        if level == 2:
            h2, h3 = name, ""
        else:
            h3 = name
    return h2, h3


def parse_page(title, text, is_main):
    heads = [(m.start(), len(m.group(1)), plain(m.group(2))) for m in HEADING.finditer(text)]
    listings, spans = [], []
    for m in LISTING.finditer(text):
        end = end_of_template(text, m.start())
        spans.append((m.start(), end))
        parts = split_top(text[m.start() + 2:end - 2])
        kind = parts[0].strip().lower()
        f = {}
        for p in parts[1:]:
            if "=" in p:
                k, v = p.split("=", 1)
                f[k.strip().lower()] = v.strip()
        if kind == "listing":
            kind = (f.get("type") or "listing").strip().lower()
        name = plain(f.get("name", ""))
        if not name:
            continue
        h2, h3 = section_for(heads, m.start())
        listings.append({"t": kind, "sec": h3 or h2, "name": name, "alt": plain(f.get("alt", "")) or None,
                         "url": (f.get("url") or "").strip() or None, "price": plain(f.get("price", "")) or None,
                         "hours": plain(f.get("hours", "")) or None, "content": plain(f.get("content", "") or f.get("description", "")),
                         "wd": bool(f.get("wikidata")), "lastedit": f.get("lastedit") or None, "page": title, "main": is_main})
    mentions = []
    pos = 0
    keep = []
    for a, b in spans:
        keep.append((pos, text[pos:a]))
        pos = b
    keep.append((pos, text[pos:]))
    for offset, chunk in keep:
        line_start = offset
        for line in chunk.split("\n"):
            t = plain(line.lstrip("*#:; "))
            if len(t) > 30 and not line.startswith("=") and DECEMBER.search(t):
                h2, h3 = section_for(heads, line_start)
                mentions.append({"sec": h3 or h2, "text": t[:320], "page": title})
            line_start += len(line) + 1
    for item in listings:
        if DECEMBER.search(item["content"] or "") or DECEMBER.search(item["name"]):
            mentions.append({"sec": item["sec"], "text": f"{item['name']}: {item['content'][:280]}", "page": title})
    return listings, mentions


def score(item):
    s = 3 * item["wd"] + (1 if item["price"] else 0) + (1 if len(item["content"]) > 150 else 0) + (1 if item["main"] else 0)
    if re.search(BOOSTS.get(item["t"], "$^"), f"{item['name']} {item['content']} {item['sec']}".lower()):
        s += 2
    return s


def candidates(listings):
    out = []
    for kind, limit in LIMITS.items():
        pool = [x for x in listings if x["t"] == kind]
        if kind == "buy":
            pool = [x for x in pool if re.search(r"christmas|market|fair", f"{x['name']} {x['content']}", re.I)]
        seen, taken = set(), 0
        for x in sorted(pool, key=score, reverse=True):
            if x["name"].lower() in seen:
                continue
            seen.add(x["name"].lower())
            slim = {**x, "content": x["content"][:230]}
            out.append({k: v for k, v in slim.items() if v not in (None, "", False)})
            taken += 1
            if taken >= limit:
                break
    return out


def main():
    only = set(sys.argv[1:])  # optional destination codes; default: all
    dests = [d for d in load_json(SET / "seed-destinations.json") if not only or d["code"] in only]
    wanted = {d["code"]: TITLES.get(d["code"]) or d["name"].split(",")[0].split(" (")[0] for d in dests}
    mains = contents(list(dict.fromkeys(wanted.values())))
    summary = []
    for d in dests:
        code, req = d["code"], wanted[d["code"]]
        if req not in mains:
            print("missing article:", code, req)
            continue
        title, text = mains[req]
        pages = [(title, text, True)]
        for _t, (resolved, body) in contents(subpages(title) + EXTRA.get(code, [])).items():
            pages.append((resolved, body, False))
        listings, mentions = [], []
        for t, body, is_main in pages:
            ls, ms = parse_page(t, body, is_main)
            listings += ls
            mentions += ms
        seen, uniq = set(), []
        for m in mentions:
            if m["text"][:80] not in seen:
                seen.add(m["text"][:80])
                uniq.append(m)
        cand = candidates(listings)
        save_json(OUT / f"{code}.json", {"code": code, "city": d["name"], "country": d["country"],
                                         "wikivoyage": f"https://en.wikivoyage.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}",
                                         "pages": [p[0] for p in pages], "listingsTotal": len(listings), "candidates": cand, "december": uniq[:24]})
        summary.append((code, len(pages), len(listings), len(cand), len(uniq)))
    print("cities", len(summary), " pages", sum(s[1] for s in summary), " listings", sum(s[2] for s in summary), " candidates", sum(s[3] for s in summary))
    print("thin (<15 candidates):", [(s[0], s[3]) for s in summary if s[3] < 15])
    print("no December lines:", [s[0] for s in summary if s[4] == 0])


if __name__ == "__main__":
    main()
