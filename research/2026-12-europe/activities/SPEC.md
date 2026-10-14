# Things to do: research spec (shared by all agents)

Context: a group of 2–5 friends, all 23-year-old university students from Norway (EEA citizens, ISIC cards possible), travel
somewhere in Europe between 4 and 18 December 2026 (most likely 7–15 Dec), 7–9 nights, on a budget. The kind of trip is open:
culture, cozy sightseeing, food, nightlife/parties, or a mix. The app shows these items per city, with prices in EUR.

## Item format
Write a JSON array. Each item:
{
  "city": "KRK",                       // destination code you were given
  "name": "Wawel Royal Castle",
  "category": "sight" | "museum" | "event" | "food" | "nightlife" | "experience",
  "blurb": "Hilltop castle and cathedral above the Vistula; the State Rooms and Crown Treasury are the highlights.",
  "priceEUR": 12.1,                    // standard adult ticket or typical spend, in EUR; 0 = free; null = unknown
  "studentEUR": 6.6,                   // what a 23-year-old student/under-26 from Norway pays, if a discount exists; else omit
  "priceText": "PLN 53, reduced PLN 29 (students under 26)",   // the price as the source states it, original currency
  "priceBasis": "official site" | "Wikivoyage" | "organiser" | "typical spend",
  "when": "Tue–Sun 9:30–17:00; closed Mondays",   // opening hours, or event dates/times; short
  "dates": {"start": "2026-11-27", "end": "2026-12-26"},  // events only
  "datesConfirmed": true,              // events only: true only if an official/organiser page lists the 2026 dates
  "bookAhead": true,                   // only if tickets sell out or timed entry is needed
  "url": "https://wawel.krakow.pl/en", // official site (or organiser); omit if none
  "source": "https://en.wikivoyage.org/wiki/Krak%C3%B3w"   // where you got the facts (page you read)
}
Category meanings: sight = landmark, old town, viewpoint, church, castle grounds; museum = museums and galleries;
event = something dated in Dec 2026 (Christmas market, festival, concert series, sports match, party);
food = food market, food hall, signature dish institution, food tour, cooking class; nightlife = bar area, club, ruin bar,
pub crawl, live music venue; experience = thermal bath, sauna, ice rink, boat trip, hike, day trip, tour, anything else.

## Rules
- Write the blurb in your own words, at most 140 characters. Never copy sentences from a source.
- Never invent prices, dates or URLs. If you cannot find a price, use null and leave priceText out.
- Convert to EUR with the rates in research/2026-12-europe/fx.json (units per 1 EUR: EUR = amount / rate). Round to 0.1.
- Student prices: note conditions in priceText (e.g. "free for EU/EEA residents under 26", "ISIC", "under 26"). Norway is in the EEA.
- For nightlife give a typical entry fee (0 if free) and, if the source says, a beer price in priceText.
- Prefer things open in December. Skip places the source says are closed in winter.
- Keep the file valid JSON (no comments). Use the Write tool, then re-read the file once to check it parses.
