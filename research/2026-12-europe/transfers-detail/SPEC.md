# Airport and station transfers: research spec (shared by all agents)

Purpose: a trip-planning app prices the trip from each arrival airport or station to the city centre and back, per
person. The traveller must be able to see exactly which service that price is for ("Bus 208 from the arrivals hall
to Kraków Główny, 40 min, PLN 6"), so they can follow it on arrival. Travellers: 2–5 students aged 23 from Norway,
travelling 4–18 December 2026 with luggage.

## Input
`input-T<n>.json`: for each city, the airports the app uses (with what an earlier quick pass found, field `known`;
treat it as a lead, not a fact) and `groundArrivals` (whether trains or buses arrive there in the app's trips).

## Output
Write ONE JSON array to `result-T<n>.json` (same folder), one object per city:
{
  "city": "KRK",
  "airports": [
    {
      "code": "KRK",
      "public": {                              // the CHEAPEST sensible public option to the centre
        "line": "SKA1 train (Koleje Małopolskie)",   // exact service: line number or name, and operator
        "from": "Airport railway stop, covered walkway from the terminal",
        "to": "Kraków Główny main station, 10 min walk to the Main Square",
        "minutes": 18,
        "fareEUR": 4.1,                        // one adult one-way ticket, converted with fx.json
        "fareText": "PLN 18; buy from the machine on the platform or the KM app",
        "frequency": "every 30 min",
        "hours": "about 04:00–23:30",
        "url": "https://..."                  // the official operator or airport page you read
      },
      "alternatives": [                        // optional: a faster or later-running public option
        { "line": "Bus 208 (MPK Kraków)", "to": "Nowy Kleparz", "minutes": 40, "fareEUR": 1.4, "fareText": "PLN 6, 60-minute ticket", "url": "https://..." }
      ],
      "taxi": {
        "fareEUR": 25,                         // per car to the centre
        "minutes": 25,
        "basis": "Bolt or Uber typical fare to the Old Town; official taxis charge about PLN 100",
        "url": "https://..."
      }
    }
  ],
  "stations": [                                // only if groundArrivals is not empty
    {
      "name": "Kraków Główny (trains) and MDA bus station (FlixBus)",
      "serves": "trains and long-distance buses",
      "toCentre": "Walk 10 min to the Main Square",
      "line": null,                            // tram or bus line if walking is not sensible
      "minutes": 10,
      "fareEUR": 0,
      "url": null
    }
  ]
}

## Rules
- Prefer, in order: the airport's own "getting to the city" page, the transit operator's page, the city's Wikivoyage
  "Get in" section (the URL is in the input), then other pages. Put the page you used in `url`.
- Give the line or service by name or number every time ("Bus 119 then Metro A", "Aerobús A1", "Leonardo Express").
  If the only option is a private shuttle, say so in `line`.
- Never invent a number, time or price; use null when you cannot find it.
- Convert to EUR with research/2026-12-europe/fx.json (units per 1 EUR: EUR = amount / rate), round to 0.1.
  Keep the original price in `fareText`.
- Taxi: per car, to the centre. Say in `basis` whether it is an official fixed fare, a meter estimate or a
  ride-hailing estimate.
- Tools: WebFetch first. At most 1 WebSearch per city. At most 4 WebFetch per city; if a site fails, move on.
- Keep the file valid JSON (no comments). Use the Write tool, then re-read it once to check it parses.
