/**
 * Fallback Metra schedule, in the same shape `buildMetraSchedule` produces.
 *
 * Used when no METRA_API_KEY is set, and as a last resort if the GTFS feed is
 * unreachable on first boot. Covers two lines with a handful of stations and a
 * few trips each, running every day, so mock mode and tests work standalone
 * without a key or network access.
 */

import { formatGtfsTime, type MetraScheduleFile } from './schedule.ts'

const ALWAYS: { days: boolean[]; startDate: string; endDate: string } = {
  days: [true, true, true, true, true, true, true],
  startDate: '19700101',
  endDate: '29991231',
}

/** [hour, minute] pairs, converted to seconds-since-midnight below. */
function trip(times: [number, number][]): number[] {
  return times.map(([h, m]) => h * 3600 + m * 60)
}

export const SEED_METRA_SCHEDULE: MetraScheduleFile = {
  source: 'seed',
  fetchedAt: null,
  publishedVersion: null,
  calendar: { SEED: ALWAYS },
  exceptions: {},
  stations: [
    {
      mapId: 'Chicago Union Station',
      name: 'Chicago Union Station',
      lines: ['BNSF'],
      stops: [
        { stopId: 'BNSF_CUS:0', direction: '0', label: 'Aurora-bound', lines: ['BNSF'] },
        { stopId: 'BNSF_CUS:1', direction: '1', label: 'Chicago Union Station-bound', lines: ['BNSF'] },
      ],
    },
    {
      mapId: 'Naperville',
      name: 'Naperville',
      lines: ['BNSF'],
      stops: [
        { stopId: 'BNSF_NAP:0', direction: '0', label: 'Aurora-bound', lines: ['BNSF'] },
        { stopId: 'BNSF_NAP:1', direction: '1', label: 'Chicago Union Station-bound', lines: ['BNSF'] },
      ],
    },
    {
      mapId: 'Aurora',
      name: 'Aurora',
      lines: ['BNSF'],
      stops: [{ stopId: 'BNSF_AUR:1', direction: '1', label: 'Chicago Union Station-bound', lines: ['BNSF'] }],
    },
    {
      mapId: 'Ogilvie Transportation Center',
      name: 'Ogilvie Transportation Center',
      lines: ['UP-N'],
      stops: [
        { stopId: 'UPN_OTC:0', direction: '0', label: 'Kenosha-bound', lines: ['UP-N'] },
        { stopId: 'UPN_OTC:1', direction: '1', label: 'Ogilvie Transportation Center-bound', lines: ['UP-N'] },
      ],
    },
    {
      mapId: 'Evanston',
      name: 'Evanston',
      lines: ['UP-N'],
      stops: [
        { stopId: 'UPN_EVN:0', direction: '0', label: 'Kenosha-bound', lines: ['UP-N'] },
        { stopId: 'UPN_EVN:1', direction: '1', label: 'Ogilvie Transportation Center-bound', lines: ['UP-N'] },
      ],
    },
    {
      mapId: 'Waukegan',
      name: 'Waukegan',
      lines: ['UP-N'],
      stops: [{ stopId: 'UPN_WKG:1', direction: '1', label: 'Ogilvie Transportation Center-bound', lines: ['UP-N'] }],
    },
  ],
  trips: [
    ...trip([[6, 5], [7, 5], [8, 5], [16, 35], [17, 35], [18, 35]]).map((seconds, i) => {
      const stops =
        i < 3
          ? [
              { platformId: 'BNSF_AUR:1', stopId: 'BNSF_AUR', sequence: 0, seconds: seconds - 3120 },
              { platformId: 'BNSF_NAP:1', stopId: 'BNSF_NAP', sequence: 1, seconds: seconds - 1200 },
              { platformId: 'BNSF_CUS:1', stopId: 'BNSF_CUS', sequence: 2, seconds },
            ]
          : [
              { platformId: 'BNSF_CUS:0', stopId: 'BNSF_CUS', sequence: 0, seconds },
              { platformId: 'BNSF_NAP:0', stopId: 'BNSF_NAP', sequence: 1, seconds: seconds + 1200 },
              { platformId: 'BNSF_AUR:0', stopId: 'BNSF_AUR', sequence: 2, seconds: seconds + 3120 },
            ]
      return {
        tripId: `SEED-BNSF-${i}`,
        gtfsRouteId: 'BNSF',
        routeId: 'BNSF' as const,
        serviceId: 'SEED',
        directionId: (i < 3 ? '1' : '0') as '0' | '1',
        headsign: i < 3 ? 'Chicago Union Station' : 'Aurora',
        startTime: formatGtfsTime(stops[0].seconds),
        stops,
      }
    }),
    ...trip([[6, 10], [7, 10], [8, 10], [16, 40], [17, 40], [18, 40]]).map((seconds, i) => {
      const stops =
        i < 3
          ? [
              { platformId: 'UPN_WKG:1', stopId: 'UPN_WKG', sequence: 0, seconds: seconds - 3300 },
              { platformId: 'UPN_EVN:1', stopId: 'UPN_EVN', sequence: 1, seconds: seconds - 1500 },
              { platformId: 'UPN_OTC:1', stopId: 'UPN_OTC', sequence: 2, seconds },
            ]
          : [
              { platformId: 'UPN_OTC:0', stopId: 'UPN_OTC', sequence: 0, seconds },
              { platformId: 'UPN_EVN:0', stopId: 'UPN_EVN', sequence: 1, seconds: seconds + 1500 },
              { platformId: 'UPN_WKG:0', stopId: 'UPN_WKG', sequence: 2, seconds: seconds + 3300 },
            ]
      return {
        tripId: `SEED-UPN-${i}`,
        gtfsRouteId: 'UP-N',
        routeId: 'UP-N' as const,
        serviceId: 'SEED',
        directionId: (i < 3 ? '1' : '0') as '0' | '1',
        headsign: i < 3 ? 'Ogilvie Transportation Center' : 'Kenosha',
        startTime: formatGtfsTime(stops[0].seconds),
        stops,
      }
    }),
  ],
}
