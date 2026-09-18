/** Types shared by the server, the React client, and the digest formatter. */

export type CardKind = 'train' | 'bus' | 'metra'

/** A single tile on the dashboard: one route, at one stop, in one direction. */
export type Card = {
  id: string
  kind: CardKind
  /** Route code: an 'L' line id ('Brn'), a bus route ('49'), or a Metra line id ('UP-N'). */
  route: string
  /** Heading text, e.g. 'Brown Line', '#49 Western', or 'UP-N'. */
  title: string
  /** Train and Metra: the station id. Bus: the route's stop-group key. */
  stationId: string
  stationName: string
  /** null means "both directions". */
  direction: string | null
  /** Resolved stop ids this card shows. Two entries when direction is null. */
  stopIds: string[]
}

/**
 * One predicted departure, normalized away from whichever upstream API it came
 * from. Everything downstream derives from `arrivalAt`, so the UI, the digest
 * and the tests never need to know the source.
 */
export type Departure = {
  route: string
  destination: string
  /** ISO 8601 instant. */
  arrivalAt: string
  isApproaching: boolean
  isDelayed: boolean
  /** Schedule-based rather than a live prediction. */
  isScheduled: boolean
  stopId: string
  direction: string
}

export type CardDepartures = {
  cardId: string
  departures: Departure[]
  /** Set when this card's upstream call failed; other cards still render. */
  error?: string
}

export type TimeFormat = 'countdown' | 'clock'
export type ColumnSetting = 'auto' | '1' | '2' | '3' | '4'
export type MobileColumnSetting = 'auto' | '1' | '2'

export type DisplayOptions = {
  timeFormat: TimeFormat
  /** Column count at desktop widths. */
  columns: ColumnSetting
  /** Column count below the mobile breakpoint; independent of `columns`. */
  mobileColumns: MobileColumnSetting
  departuresPerCard: number
}

/** A recurring Discord message: "these cards, these days, at this time". */
export type DigestRule = {
  id: string
  enabled: boolean
  name: string
  cardIds: string[]
  /** 0-6, Sunday = 0, in America/Chicago. */
  days: number[]
  /** 'HH:MM', 24-hour, America/Chicago. */
  time: string
  /** Look this far ahead from send time. */
  windowMinutes: number
  format: TimeFormat
  /** 'YYYY-MM-DD' of the last send; dedupes across restarts. */
  lastSent?: string
}

/** A scheduled window that can auto-activate a group. Same-day only. */
export type TimeWindow = {
  id: string
  /** 'HH:MM', 24-hour, America/Chicago. */
  start: string
  /** 'HH:MM', 24-hour, America/Chicago. Assumed to be after `start`. */
  end: string
}

/** A named subset of cards, shown together and optionally auto-selected by time. */
export type Group = {
  id: string
  name: string
  cardIds: string[]
  timeWindows: TimeWindow[]
}

export type Config = {
  cards: Card[]
  display: DisplayOptions
  digests: DigestRule[]
  groups: Group[]
  /** Last group the user manually viewed; falls back to the first group when unset. */
  lastSelectedGroupId: string | null
}

/* ---- Catalog: reference data that drives the card picker ---- */

export type StationStop = {
  stopId: string
  /** Compass direction from the CTA feed, e.g. 'N'. */
  direction: string
  /** Human label parsed from the stop name, e.g. 'Loop-bound'. */
  label: string
  /**
   * Lines calling at this platform. Held per stop, not just per station: at a
   * shared station like Clark/Lake the Blue Line platforms are a different pair
   * from the elevated ones, so a Brown Line card must not offer 'Forest
   * Park-bound' as one of its directions.
   */
  lines: string[]
}

export type Station = {
  mapId: string
  name: string
  /** Line ids serving this station. */
  lines: string[]
  stops: StationStop[]
}

export type BusRoute = { route: string; name: string }
export type BusStop = { stopId: string; name: string }
