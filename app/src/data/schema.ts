import { z } from 'zod'

// The research-set contract. Kept permissive (nullable, defaults) so older or partial sets still load,
// strict where the app depends on a value (ids, prices, references).

const num = z.number().nullable().optional()
const str = z.string().nullable().optional()
const strList = z.array(z.string()).default([])

export const TransferSchema = z.object({
  min: z.number(),
  eur: z.number(),
  mode: z.string().nullable().optional(),
})

/** Typical weather for the travel window, averaged over past years (see research/scripts/weather.py). */
export const ClimateSchema = z.object({
  highC: z.number(),
  lowC: z.number(),
  highP10: num,
  highP90: num,
  /** share of days with 1 mm or more of rain or snow */
  wetShare: z.number(),
  precipMm: num,
  /** share of days with 1 cm or more of fresh snow */
  snowShare: z.number().default(0),
  frostShare: z.number().default(0),
  sunH: num,
  daylightH: num,
  windKmh: num,
  link: z.object({ url: z.string(), label: z.string() }).nullable().optional(),
  period: str,
  source: str,
  sourceUrl: str,
})

/** One half month of typical weather in places.json: the 1st–15th or the 16th–end of a month. */
export const ClimatePeriodSchema = z.object({
  highC: z.number(),
  lowC: z.number(),
  highP10: num,
  highP90: num,
  wetShare: z.number(),
  precipMm: num,
  snowShare: z.number().default(0),
  frostShare: z.number().default(0),
  sunH: num,
  daylightH: num,
  windKmh: num,
  days: num,
})

export const PRICE_ITEMS = ['beerBar', 'beerShop', 'mealCheap', 'mealMid2', 'fastFood', 'cappuccino', 'transit', 'wine'] as const

/** One everyday price in EUR; `src` says where it came from (numbeo, livingcost scaled to Numbeo, or research). */
const PriceSchema = z.object({
  eur: z.number(),
  src: z.string().default('numbeo'),
  low: num,
  high: num,
  note: str,
  url: str,
  /** the pour and price actually found when the 0.5 l price was scaled from a smaller one (a 0.25 l caña doubled) */
  scaledFrom: z.object({ litres: z.number(), eur: z.number() }).nullable().optional(),
})

/** Everyday prices in a city, independent of any research set (research/scripts/prices.py and places.py). */
export const CityPricesSchema = z.object({
  items: z.object({
    /** 0.5 l of local draught beer in a bar */
    beerBar: PriceSchema.optional(),
    /** 0.5 l of domestic beer from a shop */
    beerShop: PriceSchema.optional(),
    mealCheap: PriceSchema.optional(),
    /** three courses for two at a mid-range restaurant, no drinks */
    mealMid2: PriceSchema.optional(),
    fastFood: PriceSchema.optional(),
    cappuccino: PriceSchema.optional(),
    /** one single local public transport ticket */
    transit: PriceSchema.optional(),
    /** a mid-range bottle from a shop */
    wine: PriceSchema.optional(),
  }),
  sources: z
    .array(z.object({ name: z.string(), url: z.string(), updated: str, entries: num, contributors: num, partial: z.boolean().optional() }))
    .default([]),
  /** draught beer in a bar against the median destination (100) */
  beerIndex: num,
  /** a day of eating out against the median destination (100) */
  foodIndex: num,
  /** a cheap lunch, a mid-range dinner and a cappuccino */
  foodDayEUR: num,
  /** a caveat about these prices, such as Spanish bars pouring smaller beers */
  note: str,
})

/** How to eat and drink cheaply there, from research agents reading Wikivoyage and local sources. */
export const CityTipsSchema = z.object({
  localBeer: z.array(z.string()).nullable().optional(),
  cheapEat: z.object({ name: z.string(), priceEUR: num, note: str }).nullable().optional(),
  saveTip: str,
  sources: strList,
})

/** How much paperwork a Norwegian citizen needs, easiest first: the ID card is enough … a visa is needed. */
export const PAPER_LEVELS = ['id', 'passport', 'form', 'eta', 'visa'] as const

/** Entry rules for Norwegian citizens per country (research/places/entry-*.json, merged by places.py). */
export const CountryEntrySchema = z.object({
  name: str,
  level: z.enum(PAPER_LEVELS).nullable().catch(null),
  idCard: z.boolean().nullable().optional(),
  /** what to do, in one sentence */
  paperwork: str,
  costEUR: num,
  applyDaysAhead: num,
  stayDays: num,
  passport: str,
  atBorder: str,
  url: str,
  notes: str,
})

export const PlaceSchema = z.object({
  code: z.string(),
  name: z.string(),
  country: str,
  cc: str,
  lat: num,
  lon: num,
  home: z.boolean().default(false),
  climate: z
    .object({
      periods: z.array(ClimatePeriodSchema.nullable()),
      years: z.array(z.number()).nullable().optional(),
      decemberYears: z.array(z.number()).nullable().optional(),
      link: z.object({ url: z.string(), label: z.string() }).nullable().optional(),
    })
    .nullable()
    .optional(),
  prices: CityPricesSchema.nullable().optional(),
  tips: CityTipsSchema.nullable().optional(),
})

/** research/places/places.json: city facts every research set shares (weather through the year, everyday prices). */
export const PlacesSchema = z.object({
  schema: z.literal(1),
  kind: z.literal('places'),
  generated: z.string(),
  home: str,
  climate: z
    .object({
      source: str,
      sourceUrl: str,
      years: str,
      note: str,
      periods: z.array(z.object({ month: z.number(), from: z.number(), to: z.number() })),
    })
    .nullable()
    .optional(),
  prices: z
    .object({
      fetched: str,
      sources: z.record(z.string(), z.object({ label: z.string(), url: z.string() })).nullable().optional(),
      beerMedianEUR: num,
      foodDayMedianEUR: num,
      index: str,
      foodDay: str,
      beer: str,
    })
    .nullable()
    .optional(),
  cities: z.record(z.string(), PlaceSchema),
  /** entry rules for Norwegian citizens, by ISO country code */
  countries: z.record(z.string(), CountryEntrySchema).default({}),
})

export const AirportSchema = z.object({
  code: z.string(),
  name: str,
  transferMode: str,
  transferMin: num,
  transferEUR: num,
  lat: num,
  lon: num,
})

export const DestinationSchema = z.object({
  code: z.string(),
  name: z.string(),
  country: str,
  cc: str,
  lat: z.number(),
  lon: z.number(),
  airports: z.array(AirportSchema).default([]),
  schengen: z.boolean().default(true),
  entry: str,
  december: z
    .object({ highC: num, daylightH: num, tags: strList })
    .nullable()
    .optional(),
  climate: ClimateSchema.nullable().optional(),
  /** the city's Wikivoyage article, where most things-to-do picks come from */
  wikivoyage: str,
  /** filled from places.json when the set loads */
  prices: CityPricesSchema.nullable().optional(),
  tips: CityTipsSchema.nullable().optional(),
  /** entry rules for Norwegian citizens in the destination's country, from places.json */
  entryInfo: CountryEntrySchema.nullable().optional(),
})

export const ACTIVITY_CATEGORIES = ['event', 'sight', 'museum', 'food', 'nightlife', 'experience'] as const

export const ActivitySchema = z.object({
  id: z.string(),
  city: z.string(),
  name: z.string(),
  category: z.enum(ACTIVITY_CATEGORIES).catch('experience'),
  blurb: str,
  /** standard adult price in EUR; 0 is free, null unknown */
  priceEUR: num,
  /** what a student or under-26 pays, when there is a discount */
  studentEUR: num,
  priceText: str,
  priceBasis: str,
  when: str,
  dates: z.object({ start: z.string(), end: z.string() }).nullable().optional(),
  datesConfirmed: z.boolean().nullable().optional(),
  bookAhead: z.boolean().default(false),
  url: str,
  source: str,
})

const BagSchema = z.object({
  included: z.boolean().default(false),
  addEUR: z.number().nullable().default(0),
  estimate: z.boolean().default(false),
  basis: str,
})

export const BagsSchema = z.object({
  cabin: BagSchema,
  checked: BagSchema,
  both: z.object({ addEUR: z.number().nullable().default(0), estimate: z.boolean().default(false), basis: str }),
})

export const LegTransferSchema = z.object({
  where: z.string(),
  kind: z.string(),
  place: str,
  /** the cheapest public option: `line` names the exact service ("Bus 208", "SKA1 train"), `from` and `to` its stops */
  public: z
    .object({
      eur: z.number(),
      min: num,
      mode: str,
      to: str,
      hours: str,
      line: str,
      from: str,
      freq: str,
      url: str,
      fareText: str,
      note: str,
      /** the service is researched but its fare is an earlier rough figure */
      estimate: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  taxi: z.object({ eurPerCar: z.number(), min: num, capacity: z.number().default(4), basis: str, url: str }).nullable().optional(),
})

export const LegSchema = z.object({
  id: z.string(),
  kind: z.string(),
  from: str,
  to: str,
  fromCity: z.string(),
  toCity: z.string(),
  date: str,
  returnDate: str,
  roundTrip: z.boolean().default(false),
  operator: str,
  operatedBy: str,
  stops: num,
  via: z.array(z.string().nullable()).nullable().optional(),
  durationMin: num,
  durationBackMin: num,
  layoverMin: num,
  overnight: z.boolean().default(false),
  depTime: str,
  arrTime: str,
  /** the day the leg lands, where the source gives it */
  arrDate: str,
  priceEUR: z.number(),
  priceMaxEUR: num,
  priceTypicalEUR: num,
  fareType: z.string().default('adult'),
  fareFamily: str,
  url: str,
  source: str,
  includes: strList,
  missing: strList,
  capturedAt: str,
  notes: str,
  arrivalTransfer: TransferSchema.optional(),
  departureTransfer: TransferSchema.optional(),
  bags: BagsSchema.optional(),
  transfers: z.array(LegTransferSchema).default([]),
  estimated: z.boolean().default(false),
  /** an overnight ferry sold per cabin: the party fills cabins of `berths`, and everyone pays `perPersonEUR` on top */
  cabin: z.object({ eur: z.number(), berths: z.number().default(4), perPersonEUR: z.number().default(0), name: str }).nullable().optional(),
})

export const StaySchema = z.object({
  id: z.string(),
  city: z.string(),
  platform: z.string(),
  name: z.string(),
  typeTitle: str,
  roomType: z.string(),
  sleeps: z.number(),
  bedrooms: num,
  beds: num,
  baths: num,
  checkin: str,
  checkout: str,
  nights: num,
  totalEUR: num,
  nightlyEUR: num,
  perPerson: z.boolean().default(false),
  rating: num,
  ratingScale: num,
  reviews: z.number().default(0),
  url: str,
  includes: strList,
  missing: strList,
  capturedAt: str,
  notes: str,
  unitNightlyEUR: z.number(),
  rating5: num,
  adjusted: z.number(),
  confidence: z.enum(['high', 'medium', 'low']),
  lat: num,
  lon: num,
  /** straight-line distance from the stay to the city centre */
  centerKm: num,
  address: str,
})

export const StopSchema = z.object({
  city: z.string(),
  stay: z.string(),
  nights: z.number(),
  checkin: z.string(),
  checkout: z.string(),
  altStays: strList,
})

export const TripSchema = z.object({
  id: z.string(),
  kind: z.string(),
  start: z.string(),
  end: z.string(),
  nights: z.number(),
  stops: z.array(StopSchema).min(1),
  legs: z.array(z.string()).min(1),
  legDates: z.array(z.string().nullable()).optional(),
  legAlternatives: z.array(z.array(z.string())).optional(),
  operators: strList,
  transportPP: z.number(),
  transitMin: z.number(),
  ppEstimate: z.record(z.string(), z.number()),
  weakestAdjusted: z.number(),
  headsUp: strList,
  estimated: z.boolean().default(false),
  youthFare: z.boolean().default(false),
  /**
   * For travellers flying home somewhere other than the origin, keyed by home id: the legs that replace the flight back
   * (the round trip, when the trip is one, since it cannot be split), other flights home that day, and their heads-ups.
   * A home is missing when no flight to it was found on the trip's last day.
   */
  homes: z.record(z.string(), z.object({ legs: z.array(z.string()).min(1), alts: strList, headsUp: strList })).optional(),
})

export const DiscountSchema = z.looseObject({
  provider: z.string(),
  kind: z.string().default('other'),
  country: str,
  available: z.boolean().nullable().optional(),
  eligibleAt23: z.boolean().nullable().optional(),
  ageRange: str,
  studentProofNeeded: z.boolean().nullable().optional(),
  cost: str,
  appliesTo: str,
  benefit: str,
  typicalSaving: str,
  howToBook: str,
  howToGet: str,
  conditions: str,
  relevantForTRD: str,
  worthItForThisTrip: str,
  sources: strList,
  verifiedAt: str,
  confidence: str,
  notes: str,
})

export const MetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  origin: z.string(),
  originInfo: z.object({ code: z.string(), name: z.string(), lat: z.number(), lon: z.number() }).optional(),
  currency: z.string().default('EUR'),
  window: z.object({ start: z.string(), end: z.string(), flexDays: z.number().default(0) }),
  party: z.object({ min: z.number(), max: z.number(), default: z.number() }),
  travelers: z
    .object({ age: z.number().optional(), students: z.boolean().optional(), nationality: z.string().optional() })
    .optional(),
  capturedAt: z.string(),
  generatedAt: str,
  /** where travellers fly home to; the first is the origin, the others are chosen per traveller */
  homes: z.array(z.object({ id: z.string(), name: z.string(), short: z.string().optional(), airport: z.string(), airports: z.array(z.string()) })).optional(),
  homeAirports: z.array(z.object({ code: z.string(), name: z.string(), lat: z.number(), lon: z.number() })).optional(),
  /** what the flights home do not cover yet, while their research is incomplete */
  homesNote: str,
  prior: z.object({ reviews: z.number(), mean: z.number() }),
  sources: strList,
  counts: z.record(z.string(), z.unknown()).optional(),
})

export const ResearchSetSchema = z.object({
  schema: z.literal(1),
  meta: MetaSchema,
  destinations: z.array(DestinationSchema),
  legs: z.array(LegSchema),
  stays: z.array(StaySchema),
  trips: z.array(TripSchema),
  discounts: z.array(DiscountSchema).default([]),
  activities: z.array(ActivitySchema).default([]),
})

export const SetIndexEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  file: z.string(),
  origin: z.string(),
  window: z.object({ start: z.string(), end: z.string(), flexDays: z.number().optional() }),
  capturedAt: z.string(),
  generatedAt: str,
  counts: z.record(z.string(), z.unknown()).optional(),
  sizeKB: z.number().optional(),
})

export type LegTransfer = z.infer<typeof LegTransferSchema>
export type Climate = z.infer<typeof ClimateSchema>
export type ClimatePeriod = z.infer<typeof ClimatePeriodSchema>
export type PriceItem = (typeof PRICE_ITEMS)[number]
export type CityPrices = z.infer<typeof CityPricesSchema>
export type CityTips = z.infer<typeof CityTipsSchema>
export type Place = z.infer<typeof PlaceSchema>
export type PaperLevel = (typeof PAPER_LEVELS)[number]
export type CountryEntry = z.infer<typeof CountryEntrySchema>
export type Places = z.infer<typeof PlacesSchema>
export type Activity = z.infer<typeof ActivitySchema>
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]
export type Destination = z.infer<typeof DestinationSchema>
export type Leg = z.infer<typeof LegSchema>
export type Stay = z.infer<typeof StaySchema>
export type Stop = z.infer<typeof StopSchema>
export type Trip = z.infer<typeof TripSchema>
export type Discount = z.infer<typeof DiscountSchema>
export type Meta = z.infer<typeof MetaSchema>
export type Home = NonNullable<Meta['homes']>[number]
export type ResearchSet = z.infer<typeof ResearchSetSchema>
export type SetIndexEntry = z.infer<typeof SetIndexEntrySchema>
