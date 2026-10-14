# Trip Finder

A web app for finding cheap, good trips: transport and stays priced per person, honest ratings, and what each option leaves out. It renders a **research set** (a JSON file made by `../research/compose.py`), so next year's holiday is new data, not a new app.

## Run it

Double-click `start.cmd`, or from this folder:

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run dev` first copies every composed set from `../research/*.json` into `public/research/` and writes the index the app reads.

Node.js 24 LTS was installed for this project as a portable copy in `%LOCALAPPDATA%\Programs\node-v24.21.0-win-x64`; `start.cmd` uses it. Installing Node normally works too.

## What is where

| Path | What it does |
|---|---|
| `src/data/schema.ts` | The research-set contract (Zod), and the contract of `places.json`, the city facts every set shares. Files that do not match are rejected with a readable message. |
| `src/data/model.ts` | Loads and validates a set and `places.json`, fills each destination's weather (for the set's travel window) and everyday prices from it, builds lookups, drops trips that point at missing records. |
| `src/lib/climate.ts` | Typical weather for any dates from the half-month averages in `places.json`. |
| `src/lib/prices.ts` | Price labels, the index bands (100 = the median destination) and the food and drink plans added to trip prices. |
| `src/lib/pricing.ts` | Door-to-door cost of a leg per person: fare, plus the chosen bags on that leg (0 when the fare or mode includes them), plus every airport or station transfer (public transport per person or a taxi shared per car, whichever the group setting picks). Stay cost for any party size, sharing rooms or one each. The Bayesian adjusted rating. |
| `src/lib/trips.ts` | Prices every trip for the current settings, swaps any leg that fails a transport filter for the cheapest alternative that passes, picks the cheapest stay that meets the stay filters, builds heads-ups and included or missing lists, groups trips by city combination. |
| `src/lib/filters.ts` | Every filter: what it reads from the URL, the leg and stay rules, the whole-trip rules (budget, cities, dates, nights, countries, weather, beer and food prices, events, city), facet counts and the removable chips. |
| `src/lib/places.ts` | Weather words and colour bands, things-to-do categories and prices. |
| `src/components/FilterBar.tsx`, `FilterDrawer.tsx` | The four filters that decide most trips (budget with a price histogram, stay rating, cities per trip, no long or overnight legs) stay on screen; everything else is in the All filters drawer, and every active filter shows as a chip. |
| `src/components/CityInfo.tsx` | A focused city's typical weather, everyday prices with the beer and food index and local tips, and things to do; the route details show the same per stop. |
| `src/components/MapPanel.tsx` | Trip prices, weather, beer or food prices per city; the open route with numbered stops (click one to zoom to the stay, the city centre and the airport transfer); saved routes in their compare colours; hover tips. |
| `src/pages/ExploreLayout.tsx` | The window never scrolls: setup and filters on top, the map, and a side pane that scrolls on its own. A breadcrumb (All routes › city › route) says where you are; ✕, Esc or Back step out. |
| `src/pages/RoutesPane.tsx`, `TripPane.tsx`, `ComparePane.tsx` | What the side pane shows: the ranked routes (click a card to open it, hover to preview it on the map), one route in full (each transfer names the exact bus or train), or saved routes side by side. |
| `src/state/settings.ts` | Travelers, rooms, sort, filters, the focused city and the saved shortlist live in the URL, so any view can be shared with the group. |

## Live site

https://trip-finder-europe.netlify.app (Netlify, your account, team "RandomNoobster’s team"). It is public to anyone with the link.
The code lives in https://github.com/RandomNoobster/trip-planner, and every push to `main` makes Netlify build and publish
the site (settings in `netlify.toml` at the repo root). After new research, commit the composed set
(`research/<set>.json`) and push. To publish without pushing:

```bash
npm run build
npx netlify-cli deploy --prod --dir dist --site trip-finder-europe
```

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Sync research sets and start the dev server |
| `npm run build` | Sync, type-check and build to `dist/` |
| `npm test` | Unit tests for pricing, ratings, trip evaluation and grouping |
| `npm run lint` | Oxlint |

## Stack

React 19, TypeScript 6, Vite 8, React Router 8, MapLibre GL 6 through react-map-gl with free OpenFreeMap tiles, Zod 4, Vitest 5. Plain CSS with design tokens in `src/styles/app.css`.
