/** Typed fetch helpers. One place that knows the API shape. */

import type { BusRoute, BusStop, CardDepartures, Config, Station } from '../shared/types.ts'
import type { LineId } from '../shared/lines.ts'
import type { MetraLineId } from '../shared/metraLines.ts'

export type Health = {
  ok: boolean
  mock: boolean
  discordConfigured: boolean
  stations: { source: 'portal' | 'seed'; fetchedAt: string | null; count: number }
  metraStations: { source: 'gtfs' | 'seed'; fetchedAt: string | null; count: number; tripCount: number }
  metraRealtime: { keyConfigured: boolean; fetchedAt: string | null; error: string | null; tripCount: number }
}

export type LineSummary = { id: LineId; name: string; color: string }
export type MetraLineSummary = { id: MetraLineId; name: string; color: string }
export type StationCatalog = { isSeed: boolean; stations: Station[] }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error((detail as { error?: string } | null)?.error ?? `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export const api = {
  health: () => request<Health>('/health'),
  getConfig: () => request<Config>('/config'),
  saveConfig: (config: Config) =>
    request<Config>('/config', { method: 'PUT', body: JSON.stringify(config) }),
  departures: () => request<CardDepartures[]>('/departures'),
  lines: () => request<LineSummary[]>('/catalog/lines'),
  stations: (line?: string) =>
    request<StationCatalog>(`/catalog/stations${line ? `?line=${encodeURIComponent(line)}` : ''}`),
  metraLines: () => request<MetraLineSummary[]>('/catalog/metra/lines'),
  metraStations: (line?: string) =>
    request<StationCatalog>(
      `/catalog/metra/stations${line ? `?line=${encodeURIComponent(line)}` : ''}`,
    ),
  busRoutes: () => request<BusRoute[]>('/catalog/bus/routes'),
  busDirections: (route: string) =>
    request<string[]>(`/catalog/bus/directions?rt=${encodeURIComponent(route)}`),
  busStops: (route: string, direction: string) =>
    request<BusStop[]>(
      `/catalog/bus/stops?rt=${encodeURIComponent(route)}&dir=${encodeURIComponent(direction)}`,
    ),
}
