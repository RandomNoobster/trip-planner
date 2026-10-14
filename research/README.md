# Research sets

One folder per trip season. The app renders whichever set is active; the composer turns raw captures into one validated JSON file.

## Layout

```
research/
  README.md                      this file
  compose.py                     builds <set>.json from a set folder, validates, prints coverage
  2026-12-europe/                the working folder for the Dec 2026 set
    seed-destinations.json       the destinations scouted (city code, airports, coordinates)
    destinations.json            facts per destination (Schengen, entry rules, December, airport transfers)
    fx.json                      exchange rates used to convert everything to EUR
    legs/*.json                  transport legs by source (Google Flights, Ryanair API, Rome2Rio, FlixBus)
    stays/*.json                 stays by city (Airbnb, Hostelworld)
    raw/                         anything a scout wants to keep verbatim
  2026-12-europe.json            the composed set the app loads
  places/                        city facts every set shares (not tied to a season's prices)
    cities.json                  the registry: every destination of every set, plus home cities
    climate.json                 typical weather per half month, the whole year (scripts/climate.py)
    prices.json                  everyday prices as read from Numbeo and LivingCost.org (scripts/prices.py)
    prices-research-S*.json      corrections from review agents, each with a source
    tips-H*.json                 local beer, a cheap dish and a money-saving tip per city (agents)
    places.json                  the composed file the app loads (scripts/places.py)
    raw/                         cached API answers and pages
```

## Assumptions for the Dec 2026 set

- Origin Trondheim Værnes (TRD). Travel window around 7–15 Dec 2026 with ±3 days of flexibility, 7–9 nights.
- Friends trip, 2–6 people, headcount undecided. Rooms are shared within the group by default. Private rooms only, never shared with strangers; dorm beds are never recorded.
- Travelers are assumed to hold Norwegian passports for entry rules. Change `destinations.json` if that is wrong.
- Prices in EUR. Other currencies converted with the rates in `fx.json` on the date stated there.
- Every price carries `capturedAt` and a `url`. Prices move; verify at the link before booking.
- Flight prices are per adult for one traveler; group fares can differ slightly.
- Everyone starts at Værnes, but some may fly home to Stavanger or Tønsberg instead (stated 13 Oct 2026). They fly home from the trip's last city on its last day: Stavanger via Sola (SVG), Tønsberg via Torp (TRF) or Oslo Gardermoen (OSL) plus the Vy train. Getting home from Sola or Torp is free; the Oslo train is priced as a Vy student single (50 % off for students under 30, about NOK 200; adults NOK 249–399, checked on vy.no 13 Oct 2026).
- Stay prices are for the whole unit for the dates searched (8 nights, 7–15 Dec). Date shifts of a few days change stay prices little in early December.

## Sources and what each gives

| Source | How | Gives |
|---|---|---|
| Google Flights sweep | `scripts/google_flights.py`, plain HTTP | Every airline Google sells from TRD (Norwegian, KLM, Air France, Lufthansa group with Widerøe, Finnair, SAS combinations and more): round trips on 7 date pairs, one-ways on 5 dates each way, plus per-airline cheapest fares. Falls back to Google's own results endpoint when a page arrives without results. Paced to avoid rate limits (`--slow`). |
| Google Flights intercity | `scripts/google_inter.py` | One-way flights between the cities multi-city trips use, on their exact dates |
| SAS | browser agent on flysas.com | SAS withholds fares from Google; adult and SAS Young (12–25) fares for 70 destinations. Youth booking needs a EuroBonus login. |
| Wizz Air | `scripts/wizz.py`, public timetable API | The only Wizz route from TRD (Gdańsk), every December day |
| Discounts | research agents | `discounts-airlines.json` and `discounts-ground-and-perks.json`: youth and student fares, rail cards and passes, hostel memberships, museum perks for 23-year-old Norwegian students |
| Google Flights | browser | Round trips and one-ways from TRD, dates, airlines, stops, durations, for routes whose results Google only renders in a visible browser. Queries go in `raw/google-ui/queue*.json`, the browser pane runs them with a page extractor and the answers land in `results-*.json`, which `scripts/google_ui_import.py` turns into `raw/google/<key>.json`. Round trips must use the link shape Google's own search page writes (`tfs_ui` in `scripts/google_flights.py`); the short shape now only shows "Oops, something went wrong". Google answers bursts of searches with that same error for several minutes, so runs wait about 10 s between searches. |
| Ryanair fare finder API | HTTP JSON | Cheapest one-way fares between Ryanair airports per date, for legs between stops |
| Rome2Rio | HTTP page | Train, bus and flight options between city pairs with duration and price range |
| FlixBus API | HTTP JSON | Bus prices between cities when the endpoint accepts the request |
| Airbnb search | HTTP page | Entire homes and private rooms with total price, rating, review count, bedrooms, beds |
| Hostelworld search | HTTP page | Private rooms in hostels with "from" price, rating out of 10, review count |

Booking.com refuses non-browser requests, so hotels are covered through Hostelworld private rooms and Airbnb.

### Flights home to Stavanger and Tønsberg (scripts/homes.py → legs/homes.json)

The searches are the (city, date) pairs the composed trips end on (`raw/homes/pairs.json`, `homes.py --pairs`), so re-run them after the trips change.
- Ryanair fare finder for every route into Torp or Oslo (`homes.py --fetch` → `raw/homes/ryanair-<FROM>-<TO>.json`); Ryanair does not fly to Sola. In Oct 2026: Torp from Málaga, Alicante, Milan Bergamo, Gdańsk, Kraków, Manchester, Poznań, Riga, London Stansted and Wrocław; Oslo from Stansted and Vilnius.
- Wizz Air timetable for every route into the three airports (same `--fetch`): Torp from Bucharest, Skopje, Tirana, Warsaw and Cluj; Sola from Gdańsk and Kraków; Oslo from Bratislava, Budapest, Rome, Gdańsk, Kraków, Palanga and Szczecin.
- SAS one-ways to Oslo and Sola, read on flysas.com with `scripts/sas_home_run.js` (the page's own offers API, a few searches a second; tasks in `raw/homes/sas-tasks.json`, answers in `raw/homes/sas-NNN.json`). SAS keeps its fares off Google.
- Google Flights one-ways to Sola and Oslo for every pair, and to Torp where a direct flight exists (`homes.py --queue` → `raw/google-ui/queue-H<n>.json`, read in the browser with the `__gfh` wrapper, which returns `OOPS` instead of an empty result when Google refuses a search). Google lists only about a dozen results for a search to several airports at once, so each airport is its own search. Imported by `google_ui_import.py` into `raw/google/home-<CITY>-<AIRPORT>-<DATE>.json`.
- `compose.py` gives each trip a `homes` entry per home with a flight that day: the legs that replace the flight back (a round trip cannot be split, so the outbound becomes that day's one-way), other flights home that day, and heads-ups. A home with no flight that day is left out; the app hides the trip while someone flies home there.

## Results of the Dec 2026 run (captured 10–12 Oct 2026)

| What | Count |
|---|---|
| Destinations with flights from TRD and stays | 99 (78 in Europe at first; 21 added on 12 Oct, among them Dubai, Bangkok, Tokyo, Seoul, Singapore, Kuala Lumpur, Ho Chi Minh City, Marrakesh, Agadir, Tunis, Tbilisi and Yerevan) |
| Transport legs in the composed set | 6,726 used by trips (Google Flights 4,615, Rome2Rio 634, FlixBus 591, Ryanair 586, SAS 300) of 42,489 captured; Google searches 3,281, Rome2Rio train, bus and flight options 7,468 from 481 city pairs |
| Stays in the composed set | 3,593 of 10,746 scraped (Airbnb and Hostelworld private rooms) |
| Trips | 3,780 after the 12 Oct heads-up sweep: 922 single-city, 1,645 two-city, 1,213 three-city (3,219 before it) |

Composition rules (see `compose.py`): single-city trips come from real round-trip fares with 7–9 nights; multi-city trips chain a one-way out, intercity legs (cheapest of Ryanair, FlixBus, Google, checked rail fares, Rome2Rio range) and a one-way back. A leg always uses the fare for its own travel day when one was captured; a fare seen up to 2 days away stands in (and is labelled) only where that day was not searched. Ryanair's API lists every day a route runs, so a Ryanair flight is never borrowed for a day without one, and the same goes for FlixBus days searched with `flixbus.py --dated` (`raw/flixbus/dated-done.json`). Two- and three-city trips keep the 900 and 500 cheapest combinations per bag scenario, plus the 3 cheapest for any city that would otherwise barely appear (Agadir has no flight back to Trondheim, so it only shows up this way). A trip's primary stay has at least 50 reviews and a rating of 4.0 or better on a 5 scale; cheaper or better-rated alternatives are listed as `altStays`. Per-person estimates are given for parties of 2 to 5 with rooms shared within the group. Every trip carries `headsUp` lines for transfers over 10 hours or overnight, estimated fares, and non-Schengen entry rules.

Caveats:
- Half of a round trip stands in for a one-way only where no one-way was ever searched. Bratislava's own airport has no one-way flights from TRD and Strasbourg's only routes via Lyon at about EUR 2,700, so Bratislava uses the real Trondheim–Vienna one-ways plus the bus listed in its destination entry (a city whose first airport has no one-ways borrows a listed neighbour's), and Strasbourg is single-city only.
- Rome2Rio legs are indicative ranges, not bookable fares; `priceEUR` is the low end and `priceMaxEUR` the high end. Rome2Rio stores a place name that repeats on a page once and refers to it as a variable; `scripts/rome2rio.py` reads both forms since 12 Oct 2026 (before that it missed every route for Florence, Frankfurt and Valencia, and pages fetched earlier may lack the odd route). It skips pairs it already fetched (`raw/rome2rio-tried.json`, empty ones included); `--pairs A-B,...` fetches chosen pairs at any distance.
- Hostelworld prices are "privates from" per person per night and availability was not confirmed; Airbnb totals are for the exact dates unless `notes` says otherwise.
- Rome2Rio ranges are replaced wherever an operator fare was checked: `ground-fares-verified.json` (a Sonnet agent, 12 Oct 2026; mostly "typical" ranges because rail booking engines are script-only, fixed tariffs for Poznań–Wrocław, Vienna–Bratislava and Tbilisi–Yerevan) becomes `legs/rail-verified.json` via `scripts/rail_verified.py`, and compose drops every Rome2Rio leg of the same kind on that pair.
- `ground-fares-browser.json` (12 Oct 2026) holds fares read on the operators' own sites for the travel dates, and its rows replace the researched row for the same pair: cd.cz (DE/CZ trains and two-ticket splits via Prague, timetable only to 12 Dec), jegy.mav.hu (Start Europa fares; refuses trips with both ends outside Hungary), sbb.ch (prices only from Switzerland, none for German routes), renfe.com's fare calendar, eurostar.com and westbahn.at date bars, sj.se, ltglink.lt and elron.pilet.ee (fixed fares, read on the nearest bookable date), booking.tallink.com (per cabin plus a per-person surcharge) and GNV's departures calendar (weekly sailings). bahn.de blocks automated browsers (error 751) and ÖBB's shop asks for a human check, so DB-only routes (Hamburg–Dresden, Hamburg–Zürich, Zürich–Berlin) stay ranges; Minoan and ANEK had no December Crete sailings on sale yet. Each row says where and when it was read (`checkedAt`, `fare.text`, `fare.url`); edit the file by hand when re-checking.
- Per-date fares become one leg per date plus an undated leg spanning them; compose drops that span on a date that has its own fare, and `onlyDates` rows (a weekly ferry) are never borrowed for other days. Ferry legs carry `cabin` {eur, berths, perPersonEUR}: the app splits cabins by party size (one each with "own rooms") and `priceEUR` is the share for three.
- Booking.com is not covered.

## Bags and transfers (costs.py)

Every leg in the composed set carries:
- `bags.cabin`, `bags.checked`, `bags.both`: whether the fare or mode includes that luggage and, if not, what adding it costs per person (both directions for round trips), with `estimate` and `basis`. Best source first: SAS's own Standard-fare price on the same flights, prices an airline publishes as fixed per route group (`bag-fees-verified.json`, checked 12 Oct 2026: only SAS has one, EUR 16 carry-on and EUR 18 / 35 checked bag within Scandinavia / to Europe on Light fares bought 14+ days ahead; these are exact), KLM/Norwegian bag fares sampled on comparable flights (`youth-fare-samples.json`), the airline fee table (`bag-fees.json`, typical), then typical defaults. Ryanair, Wizz Air, easyJet, Norwegian and the legacy carriers price bags per flight, so their figures stay estimates. Trains and FlixBus include luggage.
- `transfers[]`: one entry per airport or station the leg touches (Trondheim Værnes included), with the cheapest public option per person and a taxi or ride-hailing fare per car. The app picks per group size; taxis are shared by up to four. Sources, best first: `transfers-detail/result-T*.json` (6 Haiku agents, spec in `transfers-detail/SPEC.md`: the exact line or service, where it stops, fare, frequency, hours and the page used; `result-Tzz-verify.json` is a later Sonnet check of 12 fares that were rough, read last so it wins; the five it could not confirm were then read off the operators' own planners in the browser: NS, National Rail, TITSA's fare calculator and TPL FVG), then `transfers/*.json` (earlier per-airport research), then Rome2Rio. Bracketed remarks in the researched text move to `public.note`. Station transfers use the researched main station and how to reach the centre (walking counts as free), else one local ticket.

Trips are composed for three bag setups (personal item only, plus cabin bag, plus cabin and checked bag), so the cheapest options exist whichever the app is set to.

## Where stays are

`scripts/locations.py` adds coordinates: Hostelworld properties from Hostelworld's public property API (`stays/locations-hostelworld.json`) and every airport from the OurAirports open data (`airports-geo.json`); Airbnb search results already carry coordinates. `compose.py` gives each stay `centerKm`, the straight-line distance to the city centre, and drops stays more than 15 km out (20–22 km for London, Paris, Berlin, Istanbul, Rome and Madrid; the whole island for Tenerife and Gran Canaria): Airbnb's cheapest results included countryside cottages 30–70 km away that are not stays in the city. Next season, limit the Airbnb search to the city's map area instead.

## City facts shared by every set (research/places)

Weather follows the same yearly cycle and everyday prices move slowly, so neither belongs to a season's set. They live in `places/places.json`, which `app/scripts/sync-research.mjs` copies next to the sets; the app fills each destination's weather (for the set's own travel window) and prices from it, so next year's set reuses them as they are.

- `scripts/places.py --registry` adds the destinations of every set folder to `places/cities.json`; home cities (Trondheim) are there for "at home" comparisons.
- `scripts/climate.py` (weather): daily ERA5 reanalysis from the free Open-Meteo archive API, one request per city and year, cached in `places/raw/open-meteo/`. It summarises each half month of the year (the 1st–15th and the 16th–end) into daytime high and low, the usual range of highs, the share of wet days (1 mm or more), of snowy days (1 cm or more of fresh snow) and of frosty nights, sunshine and daylight hours, and wind. December also uses the Dec 4–18 windows that older sets cached for 2016–2021. Open-Meteo's free tier allows about 10,000 weighted calls a day and 5,000 an hour, and a city-year weighs about 26, so the script paces itself; four years for 78 cities takes a bit over an hour. Add years later with `--years 2018-2025` (the cache keeps what is fetched).
- `scripts/prices.py` (prices): Numbeo city pages in EUR (a meal at an inexpensive restaurant, a three-course dinner for two, a fast-food meal, 0.5 l draught beer in a bar and 0.5 l in a shop, a cappuccino, a local ticket) and LivingCost.org city pages for the same items in USD. Numbeo limits free users to a number of city pages a month; this run got 49 before the limit, and its draught-beer list covered the beer for most of the rest. The script only asks Numbeo for new pages with `--numbeo`, and stops at the first "Monthly page limit reached". The two sources agree closely on the 49 shared cities (correlation 0.90–0.99 per item), so `places.py` fills gaps with LivingCost prices scaled by the median Numbeo/LivingCost ratio per item.
- Review agents (2 Sonnet) checked implausible values against menus, operators and local news and wrote corrections with sources to `prices-research-S*.json`; tip agents (8 Haiku) wrote `tips-H*.json` from the Wikivoyage Eat and Drink listings.
- Bar beer means 0.5 l of draught lager in an ordinary bar. Spanish bars pour a caña (0.2–0.25 l) and Portuguese ones an imperial or fino (0.2 l), and Numbeo's Spanish figures were caña prices, so a Sonnet agent read 2025–26 bar menus (mostly the Cañómetro menu database) for real half-litre prices in the 11 Spanish cities and checked Portugal (`prices-research-S4.json`). Where only a smaller pour turns up, the price is scaled to 0.5 l (×2 for 0.25 l, ×2.5 for 0.2 l, ×1.25 for 0.4 l); the item keeps `scaledFrom` and the city guide says what was done under the price. Only Tenerife needed it. The old caña caveat (`COUNTRY_NOTES`) only shows where a Spanish city's bar beer is still Numbeo's.
- `scripts/places.py` composes `places.json` and the two indices: beer index = draught beer in a bar, food index = a day of eating out (a cheap lunch, half of a mid-range dinner for two and a cappuccino), both against the median destination (100). Values where Numbeo and LivingCost differ by over 30% are listed in `places/raw/price-review.json`.

## Things to do
- `activities/candidates/<CODE>.json` (`scripts/wikivoyage.py`): every See, Do, Eat, Drink and market listing from the English Wikivoyage article and its district pages, ranked, plus every line that mentions December or winter events. Wikivoyage needs a user agent with a contact URL; anonymous agents get HTTP 429.
- `activities/curated-H*.json` (8 Haiku agents, spec in `activities/SPEC.md`): 8–10 picks per city across sights, museums, food, nightlife and experiences, priced in EUR with student or under-26 prices where they exist, and the top paid items checked on their official sites.
- `activities/events-E*.json` (4 Sonnet agents, same spec): December 2026 events per city (Christmas markets, light festivals, traditions, concerts, home matches, parties), with `datesConfirmed` only when an organiser lists the 2026 dates.

`compose.py` attaches the `wikivoyage` link to each destination and merges the activity files into the set's `activities` list (duplicates by city and name are merged). Wikivoyage text is CC BY-SA; the agents write their own one-line descriptions and the app credits Wikivoyage.

## Re-running next season

1. Edit the dates, origin and party assumptions at the top of `compose.py` and the scripts; copy `seed-destinations.json` into a new set folder.
2. Run `py -3 -X utf8 -I research/scripts/ryanair.py`, `flixbus.py`, `rome2rio.py`, `airbnb.py` and `airbnb.py --cheap` (each writes into the set folder).
3. Ask Claude to run the Google Flights scout in the built-in browser and the Hostelworld and destination-facts agents.
4. Run `scripts/places.py --registry`; for new cities only, run `scripts/climate.py`, `scripts/prices.py` (add `--numbeo` early in a month) and `scripts/places.py`. Then run `scripts/wikivoyage.py` and `scripts/locations.py`; then ask Claude to run the things-to-do and events agents with `activities/SPEC.md` (change the dates in it first) and the transfer agents with `transfers-detail/SPEC.md`.
5. Run `py -3 -X utf8 research/compose.py <set>` and read its coverage report.

## Record shapes

Leg:
```json
{"id":"gf-rt-KRK-1207","kind":"flight","from":"TRD","to":"KRK","fromCity":"TRD","toCity":"KRK","date":"2026-12-07","returnDate":"2026-12-15","roundTrip":true,"operator":"Norwegian, SAS","stops":1,"via":["OSL"],"durationMin":350,"durationBackMin":370,"layoverMin":95,"overnight":false,"priceEUR":189,"priceMaxEUR":null,"priceOriginal":2030,"currencyOriginal":"NOK","url":"https://…","source":"google-flights","includes":["cabin bag"],"missing":["checked bag"],"capturedAt":"2026-10-11","notes":""}
```

Stay:
```json
{"id":"KRK-airbnb-36668697","city":"KRK","platform":"airbnb","name":"Central cosy 2Bedroom Apt","roomType":"entire_home","sleeps":4,"bedrooms":2,"beds":3,"baths":1,"checkin":"2026-12-07","checkout":"2026-12-15","nights":8,"totalEUR":914,"nightlyEUR":114,"perPerson":false,"rating":5.0,"ratingScale":5,"reviews":37,"url":"https://www.airbnb.com/rooms/36668697","includes":["kitchen","private bathroom","wifi"],"missing":["breakfast"],"searchAdults":4,"sourceUrl":"https://…","capturedAt":"2026-10-11","notes":""}
```

Destination:
```json
{"code":"KRK","name":"Kraków","country":"Poland","cc":"PL","lat":50.06,"lon":19.94,"schengen":true,"entry":null,"december":{"highC":2,"daylightH":8.1,"tags":["christmas market","nightlife","old town"]},"airports":[{"code":"KRK","name":"Kraków John Paul II","transferMode":"train","transferMin":20,"transferEUR":4}]}
```
