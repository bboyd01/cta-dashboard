/**
 * Minimal GTFS static feed reader: download the zip, unzip in memory, parse
 * the handful of CSV files we need into plain row objects.
 *
 * No GTFS library is used on purpose. The dashboard only needs read access to
 * a handful of well-known tables (stops, routes, trips, stop_times, calendar,
 * calendar_dates), and GTFS's CSV dialect (comma-separated, double-quoted
 * fields, `""` as an escaped quote) is simple enough that a small parser here
 * is less risk than a new dependency's transitive tree.
 */

import AdmZip from 'adm-zip'

export type GtfsRow = Record<string, string>

/** Parses one GTFS CSV file's text into an array of header -> value rows. */
export function parseCsv(text: string): GtfsRow[] {
  const rows = splitCsvLines(text)
  if (rows.length === 0) return []
  const header = rows[0]
  return rows.slice(1)
    .filter((row) => row.length > 1 || row[0] !== '')
    .map((row) => {
      const record: GtfsRow = {}
      header.forEach((key, i) => { record[key.trim()] = (row[i] ?? '').trim() })
      return record
    })
}

/** Splits GTFS CSV text into rows of unescaped fields, honoring quoted commas/newlines. */
function splitCsvLines(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  // Strip a UTF-8 BOM some GTFS publishers include on the first file.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]
    if (inQuotes) {
      if (char === '"') {
        if (body[i + 1] === '"') { field += '"'; i += 1 } else { inQuotes = false }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') { inQuotes = true; continue }
    if (char === ',') { row.push(field); field = ''; continue }
    if (char === '\r') continue
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += char
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

export type GtfsFeed = {
  stops: GtfsRow[]
  routes: GtfsRow[]
  trips: GtfsRow[]
  stopTimes: GtfsRow[]
  calendar: GtfsRow[]
  calendarDates: GtfsRow[]
}

const FETCH_TIMEOUT_MS = 60_000

/**
 * GETs a Metra GTFS URL with the API key attached both ways Metra's docs
 * describe accepting it (a bearer token, or an `api_token` query parameter),
 * for compatibility across the realtime and static endpoints.
 */
async function fetchMetra(url: string, apiKey: string, label: string): Promise<Response> {
  const target = new URL(url)
  if (apiKey && !target.searchParams.has('api_token')) {
    target.searchParams.set('api_token', apiKey)
  }
  let response: Response
  try {
    response = await fetch(target, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : undefined,
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    throw new Error(timedOut ? `${label} timed out` : `${label} unreachable`, { cause: error })
  }
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`)
  }
  return response
}

/** Downloads and unpacks Metra's GTFS static schedule zip. */
export async function fetchGtfsFeed(url: string, apiKey: string): Promise<GtfsFeed> {
  const response = await fetchMetra(url, apiKey, 'Metra GTFS feed')
  const buffer = Buffer.from(await response.arrayBuffer())
  return readGtfsZip(buffer)
}

/**
 * Fetches Metra's `published.txt` — a small text file identifying which
 * build of the schedule is currently live. Comparing it lets us skip
 * re-downloading and re-parsing the full schedule zip when nothing changed.
 */
export async function fetchPublishedVersion(url: string, apiKey: string): Promise<string> {
  const response = await fetchMetra(url, apiKey, 'Metra published.txt')
  return (await response.text()).trim()
}

/** Exported for tests: unpacks an already-downloaded GTFS zip buffer. */
export function readGtfsZip(buffer: Buffer): GtfsFeed {
  const zip = new AdmZip(buffer)
  const read = (name: string): GtfsRow[] => {
    const entry = zip.getEntry(name)
    return entry ? parseCsv(entry.getData().toString('utf8')) : []
  }
  return {
    stops: read('stops.txt'),
    routes: read('routes.txt'),
    trips: read('trips.txt'),
    stopTimes: read('stop_times.txt'),
    calendar: read('calendar.txt'),
    calendarDates: read('calendar_dates.txt'),
  }
}
