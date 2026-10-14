# Trip Finder — user stories and decisions

Design canvas: https://claude.ai/artifact/RfBvydwQmrMFWJmsdSPyQV

The site has one job: let the planner find cheap, good trips fast and see, for each one, the price, the quality, what is included and what is missing.

## Decisions from the planner (11 Oct 2026)

- Friends trip. Likely 2 to 5 people, headcount undecided. The travelers stepper runs 2 to 6 and defaults to 3.
- Kind of trip undecided: a boys trip, cozy sightseeing, a mix, or something else. Destinations carry a "December there" line (temperature, daylight, what is on) instead of a vibe filter.
- No must-haves except one: private rooms only, never shared with strangers. Sharing rooms within the group is fine and is the default; "own room each" is the alternative.
- No budget ceiling, but the whole point is to keep it cheap. Default sort is price per person; group total always shown.
- Dates are flexible around 7–15 Dec. Research checks ±3 days and each trip shows its cheapest dates and the saving against the fixed dates.
- No multi-city rules. The route switch (any, one city, multi-city) is a view, not a constraint.
- Transfers: no preference, but abnormally long ones (day-long, overnight layovers) must be flagged as a heads-up.
- Booking is done by the planner on the external sites. No ordered checklist, no booked-state, no itinerary mode. Trip detail keeps a plain list of booking links.
- Cancellation terms are not a factor. Removed everywhere.
- Non-Schengen destinations are fine, but the app must say what is needed to enter (shown as a heads-up on the card and on trip detail).
- Prices in EUR.

## The questions the site must answer, in the order they come up

| When | The question in the user's head | Answered by |
|---|---|---|
| First look | Where is cheapest all-in for the number of us going? | Map pills, ranked cards, travelers stepper |
| First look | What would the whole group pay? | Group total under every per-person price |
| First look | What is a place like in December? | "December there" line per stay |
| Judging a place | Is this stay really good, or rated by five people? | Adjusted rating, confidence band, review count |
| Judging a place | What is missing from the headline price? | Missing row on cards, matrix on trip detail |
| Judging a place | Anything abnormal: a day-long transfer, entry paperwork? | Heads-up row on cards, tile on trip detail |
| Comparing | Is a second city worth the extra money and hours? | Route switch, transit time tile |
| Comparing | Would shifting the dates save money? | Cheapest dates and saving on every card |
| Booking | Where do I book each piece, and is the price still true? | Links on every leg and stay, capture date everywhere |
| Next year | How do I reuse this? | Research sets page |

## User stories by scenario

### 1. The ten-minute scan
As the planner, I want the best options ranked all-in per person with quality, gaps and heads-ups visible on one screen, so I can tell in minutes whether a trip is worth pursuing.
- Design: Explore. Cards lead with price per person and the group total, then the stays with their adjusted rating, then heads-ups, missing and included.

### 2. Convincing the friends
As a group with different ideas of the trip, we want a few shortlisted options in front of us with the same rows, so we can agree.
- Design: "Copy link for the group" on trip detail. A shortlist and a side-by-side compare view are the next candidates if the group needs them.
- Open: does one person pick, or does the group vote? Only matters if a compare view is wanted.

### 3. The headcount changes
As the planner, I want per-person prices to recompute for 2 to 6 people, with rooms shared among us or one each, so the numbers stay true as friends join or drop out.
- Design: travelers stepper and rooms select recompute every card and marker live.

### 4. Is this place actually good?
As the planner, I want a rating that discounts tiny samples, so a 4.9 from twelve reviews does not beat a 4.6 from twelve hundred.
- Design: Bayesian adjusted rating with a tweakable prior, confidence bands, weakest-stay sorting for multi-city trips, optional "hide low-confidence stays".
- Open: should the research also extract the top recurring complaint per stay? Cheap to add, useful for December (heating, noise).

### 5. What am I actually getting?
As the planner, I want every stay and leg checked against the same list (private room, private bathroom, breakfast, kitchen, central, checked bag, seat), with add-on prices, so headline prices are comparable.
- Design: included and missing chips, the per-stay matrix, the "with every extra" total on trip detail. Nothing is a hard filter.

### 6. One city or three?
As the planner, I want to see what a second or third city adds in cost and hours against staying put, so I can judge whether the variety is worth it.
- Design: route switch on Explore, transit time on trip detail. No rules on nights per city or number of cities.

### 7. Dates with give
As the planner, I would move the trip by a few days if it saved real money, so every trip shows its cheapest dates within the flexible window.
- Design: trip bar shows "around 7–15 Dec, ±3 days"; each card shows its dates and the saving.

### 8. Abnormal transfers
As the planner, I do not care where a flight connects, but a day-long transfer or an overnight layover is stupid, so I want it flagged, not hidden in a duration.
- Design: amber heads-up chip on the card, validation warning in the research set, layover row in the transport extras table.

### 9. Entering a country outside Schengen
As a traveler, I want to be told what I need to enter a non-Schengen country (passport, UK ETA and the like), so a cheap Edinburgh trip does not end at the border.
- Design: heads-up chip on the card and the entry tile on trip detail; the research set carries `schengen` and `entry` per destination.

### 10. Why go there in December?
As the planner with the kind of trip undecided, I want a line per destination on temperature, daylight and what is on, so I can picture a boys trip or a cozy sightseeing week there.
- Design: "December there" line under every stay.

### 11. Next year
As the planner, I want to prompt again with new dates and party size and get a new research set, so the app stays and only the data changes.
- Design: research sets page, schema v1, validator.
