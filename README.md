# Trip Finder

Cheap trips around Europe (and a few easy places beyond) for a group of students flying from Trondheim Værnes in
December 2026: every route priced door to door with flights, trains, buses, bags, airport transfers and private stays,
and flights home to Stavanger or Tønsberg for anyone who splits off at the end.

Live: https://trip-finder-europe.netlify.app (built by Netlify from `main` on every push, see `netlify.toml`).

| Folder | What is there |
|---|---|
| `app/` | The React app (Vite, MapLibre). `npm run dev` to run it, `npm test` for the tests. See `app/README.md`. |
| `research/` | The scripts that collect fares, stays and city facts, their saved answers, and `compose.py`, which builds the research set the app reads (`research/2026-12-europe.json`). See `research/README.md`. |
| `docs/` | User stories. |
