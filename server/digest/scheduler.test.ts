import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { dueRules, runDigestTick } from './scheduler.ts'
import { buildDigestMessage } from './discord.ts'
import { ConfigStore, defaultConfig } from '../config-store.ts'
import { TtlCache } from '../cache.ts'
import type { Card, Config, DigestRule, Departure } from '../../shared/types.ts'
import type { CtaProvider } from '../cta/types.ts'

// 2026-09-11 is a Friday. 11:00 UTC is 06:00 in Chicago (CDT).
const FRIDAY_6AM = new Date('2026-09-11T11:00:00Z')

const card = (over: Partial<Card> = {}): Card => ({
  id: 'c1', kind: 'train', route: 'Brn', title: 'Brown Line',
  stationId: '41320', stationName: 'Western', direction: 'S', stopIds: ['30226'],
  ...over,
})

const rule = (over: Partial<DigestRule> = {}): DigestRule => ({
  id: 'r1', enabled: true, name: 'Morning commute', cardIds: ['c1'],
  days: [1, 2, 3, 4, 5], time: '06:00', windowMinutes: 30, format: 'clock',
  ...over,
})

const config = (over: Partial<Config> = {}): Config => ({
  ...defaultConfig(), cards: [card()], digests: [rule()], ...over,
})

const dep = (over: Partial<Departure> = {}): Departure => ({
  route: 'Brn', destination: 'Loop', arrivalAt: '2026-09-11T11:12:00Z',
  isApproaching: false, isDelayed: false, isScheduled: false,
  stopId: '30226', direction: 'S',
  ...over,
})

describe('dueRules', () => {
  it('fires at the configured Chicago time on a configured day', () => {
    expect(dueRules(config(), FRIDAY_6AM).map((r) => r.id)).toEqual(['r1'])
  })

  it('does not fire before the configured time', () => {
    expect(dueRules(config(), new Date('2026-09-11T10:59:00Z'))).toEqual([])
  })

  it('still fires shortly after, so a restart does not skip the digest', () => {
    // Container came back up at 06:02 Chicago.
    expect(dueRules(config(), new Date('2026-09-11T11:02:00Z'))).toHaveLength(1)
  })

  it('stops firing once the grace window has passed', () => {
    expect(dueRules(config(), new Date('2026-09-11T11:06:00Z'))).toEqual([])
  })

  it('does not fire on a day that is not selected', () => {
    // Saturday.
    expect(dueRules(config(), new Date('2026-09-12T11:00:00Z'))).toEqual([])
  })

  it('does not fire twice on the same Chicago day', () => {
    const already = config({ digests: [rule({ lastSent: '2026-09-11' })] })
    expect(dueRules(already, FRIDAY_6AM)).toEqual([])
  })

  it('fires again the next day', () => {
    const yesterday = config({ digests: [rule({ lastSent: '2026-09-10' })] })
    expect(dueRules(yesterday, FRIDAY_6AM)).toHaveLength(1)
  })

  it('skips a disabled rule', () => {
    expect(dueRules(config({ digests: [rule({ enabled: false })] }), FRIDAY_6AM)).toEqual([])
  })

  it('skips a rule with no cards selected', () => {
    expect(dueRules(config({ digests: [rule({ cardIds: [] })] }), FRIDAY_6AM)).toEqual([])
  })

  it('uses Chicago days, not UTC ones', () => {
    // 01:00 UTC Saturday is still Friday evening in Chicago.
    const lateFriday = config({ digests: [rule({ days: [5], time: '20:00' })] })
    expect(dueRules(lateFriday, new Date('2026-09-12T01:00:00Z'))).toHaveLength(1)
  })
})

describe('buildDigestMessage', () => {
  const now = FRIDAY_6AM

  it('lists departures inside the window as literal times', () => {
    const message = buildDigestMessage(
      rule(), [card()],
      [{ cardId: 'c1', departures: [dep(), dep({ arrivalAt: '2026-09-11T11:21:00Z' })] }],
      now,
    )
    expect(message.embeds[0].title).toBe('Brown Line — Western · S')
    expect(message.embeds[0].description).toBe('**6:12 AM** → Loop\n**6:21 AM** → Loop')
  })

  it('renders countdowns when the rule asks for them', () => {
    const message = buildDigestMessage(
      rule({ format: 'countdown' }), [card()],
      [{ cardId: 'c1', departures: [dep()] }], now,
    )
    expect(message.embeds[0].description).toBe('**12 min** → Loop')
  })

  it('excludes departures beyond the window', () => {
    const message = buildDigestMessage(
      rule({ windowMinutes: 15 }), [card()],
      [{ cardId: 'c1', departures: [dep(), dep({ arrivalAt: '2026-09-11T11:50:00Z' })] }],
      now,
    )
    expect(message.embeds[0].description).not.toContain('6:50')
  })

  it('says so explicitly when nothing is in the window', () => {
    const message = buildDigestMessage(rule(), [card()], [{ cardId: 'c1', departures: [] }], now)
    expect(message.embeds[0].description).toBe('Nothing in the next 30 minutes.')
  })

  it('reports an upstream failure instead of looking like an empty window', () => {
    const message = buildDigestMessage(
      rule(), [card()], [{ cardId: 'c1', departures: [], error: 'Train Tracker timed out' }], now,
    )
    expect(message.embeds[0].description).toContain('Train Tracker timed out')
  })

  it('flags delayed and scheduled departures', () => {
    const message = buildDigestMessage(
      rule(), [card()],
      [{ cardId: 'c1', departures: [dep({ isDelayed: true, isScheduled: true })] }], now,
    )
    expect(message.embeds[0].description).toContain('_(delayed, scheduled)_')
  })

  it('labels a both-directions card', () => {
    const message = buildDigestMessage(
      rule(), [card({ direction: null })], [{ cardId: 'c1', departures: [] }], now,
    )
    expect(message.embeds[0].title).toContain('Both directions')
  })

  it('colors the embed with the line color', () => {
    const message = buildDigestMessage(rule(), [card()], [{ cardId: 'c1', departures: [] }], now)
    expect(message.embeds[0].color).toBe(0x62361b)
  })

  it('emits one embed per selected card', () => {
    const cards = [card(), card({ id: 'c2', route: 'Red', title: 'Red Line' })]
    const message = buildDigestMessage(
      rule({ cardIds: ['c1', 'c2'] }), cards,
      [{ cardId: 'c1', departures: [] }, { cardId: 'c2', departures: [] }], now,
    )
    expect(message.embeds).toHaveLength(2)
  })
})

describe('runDigestTick', () => {
  let dir: string
  let store: ConfigStore

  const provider = (departures: Departure[] = [dep()]): CtaProvider => ({
    trainArrivals: vi.fn().mockResolvedValue(departures),
    busPredictions: vi.fn().mockResolvedValue([]),
    busRoutes: vi.fn().mockResolvedValue([]),
    busDirections: vi.fn().mockResolvedValue([]),
    busStops: vi.fn().mockResolvedValue([]),
  })

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cta-digest-'))
    store = new ConfigStore(path.join(dir, 'config.json'))
    await store.load()
    await store.save(config())
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  const deps = (send: ReturnType<typeof vi.fn>, now = FRIDAY_6AM) => ({
    store, provider: provider(), cache: new TtlCache(30_000),
    webhookUrl: 'https://discord.test/hook', send, now: () => now,
  })

  it('sends the digest and records the send', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    expect(await runDigestTick(deps(send))).toHaveLength(1)

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toBe('https://discord.test/hook')
    expect(send.mock.calls[0][1].embeds[0].description).toContain('6:12 AM')
    expect(store.get().digests[0].lastSent).toBe('2026-09-11')
  })

  it('does not send again on a later tick the same day', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await runDigestTick(deps(send))
    await runDigestTick(deps(send, new Date('2026-09-11T11:03:00Z')))
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('survives a restart without resending', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await runDigestTick(deps(send))

    const reloaded = new ConfigStore(path.join(dir, 'config.json'))
    await reloaded.load()
    expect(dueRules(reloaded.get(), new Date('2026-09-11T11:03:00Z'))).toEqual([])
  })

  it('leaves lastSent unset when Discord rejects, so the next tick retries', async () => {
    const send = vi.fn().mockRejectedValue(new Error('HTTP 429'))
    expect(await runDigestTick(deps(send))).toEqual([])
    expect(store.get().digests[0].lastSent).toBeUndefined()

    const retry = vi.fn().mockResolvedValue(undefined)
    await runDigestTick(deps(retry, new Date('2026-09-11T11:02:00Z')))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('sends nothing when no rule is due', async () => {
    const send = vi.fn()
    expect(await runDigestTick(deps(send, new Date('2026-09-11T14:00:00Z')))).toEqual([])
    expect(send).not.toHaveBeenCalled()
  })
})
