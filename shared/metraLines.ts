/**
 * Metra line identity, parallel to `shared/lines.ts` for the CTA 'L'.
 *
 * Metra does not publish a single official hex per line the way the CTA does;
 * each line's color comes from its timetable accent, itself named after the
 * historic railroad it descends from ("Rocket Red" for the Rock Island's
 * Rockets, "Panama Orange" for the Illinois Central heritage of Metra
 * Electric, and so on). The values below are a best-effort match to those
 * named accents — tweak them here if Metra's own branding differs.
 *
 * Route ids match the `route_id` Metra's GTFS feed publishes.
 */

export type MetraLineId =
  | 'BNSF'
  | 'HC'
  | 'ME'
  | 'MD-N'
  | 'MD-W'
  | 'NCS'
  | 'RI'
  | 'SWS'
  | 'UP-N'
  | 'UP-NW'
  | 'UP-W'

export type MetraLineInfo = {
  id: MetraLineId
  name: string
  color: string
  onColor: string
}

const WHITE = '#ffffff'
const INK = '#15181d'

export const METRA_LINES: Record<MetraLineId, MetraLineInfo> = {
  BNSF: { id: 'BNSF', name: 'BNSF Railway', color: '#4C8C4A', onColor: WHITE },
  HC: { id: 'HC', name: 'Heritage Corridor', color: '#7A1F2B', onColor: WHITE },
  ME: { id: 'ME', name: 'Metra Electric', color: '#F48F1E', onColor: INK },
  'MD-N': { id: 'MD-N', name: 'Milwaukee District North', color: '#F4A24C', onColor: INK },
  'MD-W': { id: 'MD-W', name: 'Milwaukee District West', color: '#C9A227', onColor: INK },
  NCS: { id: 'NCS', name: 'North Central Service', color: '#9063CD', onColor: WHITE },
  RI: { id: 'RI', name: 'Rock Island District', color: '#DA291C', onColor: WHITE },
  SWS: { id: 'SWS', name: 'SouthWest Service', color: '#0071BC', onColor: WHITE },
  'UP-N': { id: 'UP-N', name: 'Union Pacific North', color: '#00843D', onColor: WHITE },
  'UP-NW': { id: 'UP-NW', name: 'Union Pacific Northwest', color: '#FEDD00', onColor: INK },
  'UP-W': { id: 'UP-W', name: 'Union Pacific West', color: '#FFB1BB', onColor: INK },
}

export const METRA_LINE_IDS = Object.keys(METRA_LINES) as MetraLineId[]

/** Aliases for route ids some Metra feeds spell slightly differently. */
const ALIASES: Record<string, MetraLineId> = {
  ELECTRIC: 'ME',
  MED: 'ME',
  RID: 'RI',
  ROCKISLAND: 'RI',
}

export function isMetraLineId(value: string): value is MetraLineId {
  return value in METRA_LINES
}

/** Normalizes a raw GTFS route_id onto one of our known line ids, if possible. */
export function normalizeMetraLineId(routeId: string): MetraLineId | null {
  const trimmed = routeId.trim().toUpperCase()
  if (isMetraLineId(trimmed)) return trimmed as MetraLineId
  return ALIASES[trimmed] ?? null
}
