// Validates every composed research set (research/<id>.json) against the app's schema, copies the valid ones into
// public/research and writes public/research/sets.json, the index the app reads. Also copies research/places/places.json,
// the city facts every set shares (weather through the year, everyday prices). Runs before `dev` and `build`.
// Node 24 runs the TypeScript schema directly (type stripping), so the app and this check share one contract.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PlacesSchema, ResearchSetSchema } from '../src/data/schema.ts'

const here = dirname(fileURLToPath(import.meta.url))
const researchDir = resolve(here, '../../research')
const outDir = resolve(here, '../public/research')
mkdirSync(outDir, { recursive: true })

const placesPath = join(researchDir, 'places', 'places.json')
try {
  const places = PlacesSchema.safeParse(JSON.parse(readFileSync(placesPath, 'utf8')))
  if (places.success) {
    copyFileSync(placesPath, join(outDir, 'places.json'))
    const cities = Object.values(places.data.cities)
    console.log(`places.json: valid, ${cities.length} cities, ${cities.filter((c) => c.climate).length} with weather, ${cities.filter((c) => c.prices).length} with prices`)
  } else {
    console.warn('skipped places.json: not valid')
    for (const issue of places.error.issues.slice(0, 5)) console.warn(`  ${issue.path.join('.')}: ${issue.message}`)
  }
} catch {
  console.warn('no research/places/places.json yet: the app uses the weather inside each set and shows no prices')
}

const sets = []
for (const file of readdirSync(researchDir)) {
  if (!file.endsWith('.json')) continue
  const path = join(researchDir, file)
  let data
  try {
    data = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    continue
  }
  if (data?.schema === undefined || !data.meta) continue
  const result = ResearchSetSchema.safeParse(data)
  if (!result.success) {
    console.warn(`skipped ${file}: not a valid research set`)
    for (const issue of result.error.issues.slice(0, 5)) console.warn(`  ${issue.path.join('.')}: ${issue.message}`)
    continue
  }
  const legIds = new Set(result.data.legs.map((l) => l.id))
  const stayIds = new Set(result.data.stays.map((s) => s.id))
  const broken = result.data.trips.filter((t) => t.legs.some((id) => !legIds.has(id)) || t.stops.some((s) => !stayIds.has(s.stay))).length
  copyFileSync(path, join(outDir, file))
  const m = result.data.meta
  sets.push({
    id: m.id,
    title: m.title,
    file: `research/${file}`,
    origin: m.origin,
    window: m.window,
    capturedAt: m.capturedAt,
    generatedAt: m.generatedAt ?? null,
    counts: m.counts ?? {},
    sizeKB: Math.round(statSync(path).size / 1024),
  })
  console.log(`${file}: valid, ${result.data.trips.length} trips${broken ? `, ${broken} with broken references (the app skips them)` : ''}`)
}
sets.sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))
writeFileSync(join(outDir, 'sets.json'), JSON.stringify(sets, null, 1))
console.log(`synced ${sets.length} research set(s) into public/research`)
