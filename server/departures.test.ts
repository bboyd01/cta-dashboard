import { describe, it, expect, vi } from 'vitest'
import { loadDepartures } from './departures.ts'
import { TtlCache } from './cache.ts'
import type { Card, Departure } from '../shared/types.ts'
import type { CtaProvider } from './cta/types.ts'

const NOW = new Date('2026-09-11T12:00:00Z')

const trainCard = (over: Partial<Card> = {}): Card => ({
  id: 'c1', kind: 'train', route: 'Brn', title: 'Brown Line',
  stationId: '41320', stationName: 'Western', direction: 'S', stopIds: ['30226'],
  ...over,
})

const busCard = (over: Partial<Card> = {}): Card => ({
  id: 'b1', kind: 'bus', route: '49', title: '#49 Western',
  stationId: '49', stationName: 'Western & Armitage', direction: 'Northbound',
  stopIds: ['456'],
  ...over,
})

const metraCard = (over: Partial<Card> = {}): Card => ({
  id: 'm1', kind: 'metra', route: 'BNSF', title: 'BNSF Railway',
  stationId: 'Naperville', stationName: 'Naperville', direction: 'Chicago Union Station-bound',
  stopIds: ['BNSF_NAP:1'],
  ...over,
})

const dep = (over: Partial<Departure> = {}): Departure => ({
  route: 'Brn', destination: 'Loop', arrivalAt: '2026-09-11T12:07:00Z',
  isApproaching: false, isDelayed: false, isScheduled: false,
  stopId: '30226', direction: 'S',
  ...over,
})

function provider(over: Partial<CtaProvider> = {}): CtaProvider {
  return {
    trainArrivals: vi.fn().mockResolvedValue([]),
    busPredictions: vi.fn().mockResolvedValue([]),
    busRoutes: vi.fn().mockResolvedValue([]),
    busDirections: vi.fn().mockResolvedValue([]),
    busStops: vi.fn().mockResolvedValue([]),
    metraArrivals: vi.fn().mockResolvedValue([]),
    ...over,
  }
}

describe('loadDepartures batching', () => {
  it('makes one station call for several cards at the same station', async () => {
    const trainArrivals = vi.fn().mockResolvedValue([dep(), dep({ route: 'P', stopId: '30226' })])
    const cards = [
      trainCard({ id: 'a', route: 'Brn' }),
      trainCard({ id: 'b', route: 'P' }),
    ]
    const result = await loadDepartures(cards, provider({ trainArrivals }), new TtlCache(30_000), NOW)

    expect(trainArrivals).toHaveBeenCalledTimes(1)
    expect(result.map((r) => r.departures.length)).toEqual([1, 1])
  })

  it('makes one call per ten bus stops', async () => {
    const busPredictions = vi.fn().mockResolvedValue([])
    const cards = Array.from({ length: 12 }, (_, i) =>
      busCard({ id: `b${i}`, stopIds: [`stop${i}`] }))
    await loadDepartures(cards, provider({ busPredictions }), new TtlCache(30_000), NOW)

    expect(busPredictions).toHaveBeenCalledTimes(2)
    expect(busPredictions.mock.calls[0][0]).toHaveLength(10)
    expect(busPredictions.mock.calls[1][0]).toHaveLength(2)
  })

  it('makes one call per Metra station for several cards there', async () => {
    const metraArrivals = vi.fn().mockResolvedValue([
      dep({ route: 'BNSF', stopId: 'BNSF_NAP:1' }),
      dep({ route: 'UP-N', stopId: 'BNSF_NAP:1' }),
    ])
    const cards = [
      metraCard({ id: 'a', route: 'BNSF' }),
      metraCard({ id: 'b', route: 'UP-N', stopIds: ['BNSF_NAP:1'] }),
    ]
    const result = await loadDepartures(cards, provider({ metraArrivals }), new TtlCache(30_000), NOW)

    expect(metraArrivals).toHaveBeenCalledTimes(1)
    expect(result.map((r) => r.departures.length)).toEqual([1, 1])
  })

  it('does not re-request a station within the cache window', async () => {
    const trainArrivals = vi.fn().mockResolvedValue([dep()])
    const cache = new TtlCache(30_000)
    await loadDepartures([trainCard()], provider({ trainArrivals }), cache, NOW)
    await loadDepartures([trainCard()], provider({ trainArrivals }), cache, NOW)
    expect(trainArrivals).toHaveBeenCalledTimes(1)
  })

  it('bypasses the cache when asked for fresh data', async () => {
    const trainArrivals = vi.fn().mockResolvedValue([dep()])
    const cache = new TtlCache(30_000)
    await loadDepartures([trainCard()], provider({ trainArrivals }), cache, NOW)
    await loadDepartures([trainCard()], provider({ trainArrivals }), cache, NOW, { fresh: true })
    expect(trainArrivals).toHaveBeenCalledTimes(2)
  })
})

describe('loadDepartures filtering', () => {
  it('filters a shared platform down to the card’s own line', async () => {
    const trainArrivals = vi.fn().mockResolvedValue([
      dep({ route: 'Brn' }),
      dep({ route: 'P' }),
      dep({ route: 'Brn', stopId: '30225' }),
    ])
    const [card] = await loadDepartures(
      [trainCard()], provider({ trainArrivals }), new TtlCache(30_000), NOW,
    )
    expect(card.departures).toHaveLength(1)
    expect(card.departures[0].route).toBe('Brn')
  })

  it('merges both stops for a both-directions card', async () => {
    const trainArrivals = vi.fn().mockResolvedValue([
      dep({ stopId: '30225', arrivalAt: '2026-09-11T12:03:00Z' }),
      dep({ stopId: '30226', arrivalAt: '2026-09-11T12:09:00Z' }),
    ])
    const [card] = await loadDepartures(
      [trainCard({ direction: null, stopIds: ['30225', '30226'] })],
      provider({ trainArrivals }), new TtlCache(30_000), NOW,
    )
    expect(card.departures.map((d) => d.arrivalAt)).toEqual([
      '2026-09-11T12:03:00Z',
      '2026-09-11T12:09:00Z',
    ])
  })

  it('drops departures that have already gone', async () => {
    const trainArrivals = vi.fn().mockResolvedValue([
      dep({ arrivalAt: '2026-09-11T11:45:00Z' }),
      dep({ arrivalAt: '2026-09-11T12:09:00Z' }),
    ])
    const [card] = await loadDepartures(
      [trainCard()], provider({ trainArrivals }), new TtlCache(30_000), NOW,
    )
    expect(card.departures).toHaveLength(1)
  })

  it('routes bus predictions to the card that owns the stop', async () => {
    const busPredictions = vi.fn().mockResolvedValue([
      dep({ route: '49', stopId: '456', direction: 'Northbound' }),
      dep({ route: '49', stopId: '789', direction: 'Southbound' }),
    ])
    const result = await loadDepartures(
      [busCard({ id: 'nb', stopIds: ['456'] }), busCard({ id: 'sb', stopIds: ['789'] })],
      provider({ busPredictions }), new TtlCache(30_000), NOW,
    )
    expect(result.find((r) => r.cardId === 'nb')!.departures[0].stopId).toBe('456')
    expect(result.find((r) => r.cardId === 'sb')!.departures[0].stopId).toBe('789')
  })
})

describe('loadDepartures failures', () => {
  it('reports the error on the affected card and leaves the others working', async () => {
    const trainArrivals = vi.fn(async (mapId: string) => {
      if (mapId === '41320') throw new Error('Train Tracker timed out')
      return [dep({ stopId: '30050', route: 'Red' })]
    })
    const result = await loadDepartures(
      [
        trainCard({ id: 'broken' }),
        trainCard({ id: 'fine', stationId: '41660', route: 'Red', stopIds: ['30050'] }),
      ],
      provider({ trainArrivals }), new TtlCache(30_000), NOW,
    )
    expect(result[0]).toMatchObject({ cardId: 'broken', error: 'Train Tracker timed out' })
    expect(result[1].error).toBeUndefined()
    expect(result[1].departures).toHaveLength(1)
  })

  it('fails only the batch that errored', async () => {
    const busPredictions = vi.fn(async (ids: string[]) => {
      if (ids.includes('stop10')) throw new Error('Bus Tracker unreachable')
      return [dep({ stopId: 'stop0', route: '49' })]
    })
    const cards = Array.from({ length: 12 }, (_, i) =>
      busCard({ id: `b${i}`, stopIds: [`stop${i}`] }))
    const result = await loadDepartures(
      cards, provider({ busPredictions }), new TtlCache(30_000), NOW,
    )
    expect(result[0].error).toBeUndefined()
    expect(result[10].error).toBe('Bus Tracker unreachable')
  })

  it('returns an empty list rather than erroring for no cards', async () => {
    expect(await loadDepartures([], provider(), new TtlCache(30_000), NOW)).toEqual([])
  })
})
