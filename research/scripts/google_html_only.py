"""Fetch the queued Google Flights queries whose results Google renders on the server (plain HTML), and write them in
google_flights.py's raw format (raw/google/<key>.json). Queries that come back as "Loading results" are left for the
browser (gf_ui_extract.js); Google's results endpoint is never called here.
Run: py -3 -X utf8 -I -u research/scripts/google_html_only.py raw/google-ui/queue-E.json"""
import json
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import google_flights as g  # noqa: E402
from common import SET, load_json, save_json  # noqa: E402


def main():
    queue = load_json(SET / sys.argv[1])
    done = skipped = 0
    for q in queue:
        path = g.RAW / f"{q['key']}.json"
        if path.exists():
            continue
        html = g.fetch(q["url"])
        if not html:
            skipped += 1
            continue
        its = []
        for lab in g.labels(html):
            p = g.parse_label(lab)
            if p:
                p["label"] = lab
                its.append(p)
        if not its:
            skipped += 1
            continue
        save_json(path, {"url": q["url"], "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
                         "priceUnavailable": html.count("Price unavailable"), "via": "html", "itineraries": its})
        done += 1
        print(f"  {q['key']}: {len(its)} itineraries, from €{min(i['price'] for i in its):.0f}", flush=True)
        time.sleep(random.uniform(1.0, 2.0))
    print(f"server-rendered: {done}; left for the browser: {skipped}")


if __name__ == "__main__":
    main()
