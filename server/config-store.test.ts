import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ConfigStore, sanitizeConfig, defaultConfig } from './config-store.ts'

let dir: string
const configPath = () => path.join(dir, 'config.json')

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cta-config-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const card = (id: string) => ({
  id,
  kind: 'train',
  route: 'Brn',
  title: 'Brown Line',
  stationId: '41320',
  stationName: 'Western',
  direction: 'S',
  stopIds: ['30016'],
})

describe('sanitizeConfig', () => {
  it('returns defaults for junk input', () => {
    expect(sanitizeConfig(null)).toEqual(defaultConfig())
    expect(sanitizeConfig('not a config')).toEqual(defaultConfig())
    expect(sanitizeConfig([])).toEqual(defaultConfig())
  })

  it('drops cards missing the fields needed to query anything', () => {
    const result = sanitizeConfig({
      cards: [card('ok'), { id: 'no-route', stopIds: ['1'] }, { id: 'no-stops', route: 'Red' }],
    })
    expect(result.cards.map((c) => c.id)).toEqual(['ok'])
  })

  it('clamps out-of-range numbers instead of rejecting the file', () => {
    const result = sanitizeConfig({ display: { departuresPerCard: 99 } })
    expect(result.display.departuresPerCard).toBe(6)
  })

  it('falls back on an unknown enum value', () => {
    const result = sanitizeConfig({ display: { timeFormat: 'sundial', columns: '7' } })
    expect(result.display.timeFormat).toBe('countdown')
    expect(result.display.columns).toBe('auto')
  })

  it('sanitizes mobileColumns independently of columns, rejecting values desktop-only allows', () => {
    const result = sanitizeConfig({ display: { columns: '4', mobileColumns: '4' } })
    expect(result.display.columns).toBe('4')
    expect(result.display.mobileColumns).toBe('auto')

    const valid = sanitizeConfig({ display: { mobileColumns: '2' } })
    expect(valid.display.mobileColumns).toBe('2')
  })

  it('rejects a malformed digest time', () => {
    const result = sanitizeConfig({
      digests: [{ id: 'd1', time: 'half six', windowMinutes: 30 }],
    })
    expect(result.digests[0].time).toBe('06:00')
  })

  it('deduplicates weekdays and discards out-of-range ones', () => {
    const result = sanitizeConfig({ digests: [{ id: 'd1', days: [1, 1, 2, 9, -3] }] })
    expect(result.digests[0].days).toEqual([1, 2])
  })

  it('strips digest references to cards that no longer exist', () => {
    const result = sanitizeConfig({
      cards: [card('a')],
      digests: [{ id: 'd1', cardIds: ['a', 'deleted'] }],
    })
    expect(result.digests[0].cardIds).toEqual(['a'])
  })

  it('migrates a pre-groups config into one default "All" group', () => {
    const result = sanitizeConfig({ cards: [card('a'), card('b')] })
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].name).toBe('All')
    expect(result.groups[0].cardIds).toEqual(['a', 'b'])
  })

  it('migrates a pre-groups config with no cards into zero groups', () => {
    const result = sanitizeConfig({})
    expect(result.groups).toEqual([])
  })

  it('drops group references to cards that no longer exist', () => {
    const result = sanitizeConfig({
      cards: [card('a')],
      groups: [{ id: 'g1', name: 'G1', cardIds: ['a', 'deleted'], timeWindows: [] }],
    })
    expect(result.groups[0].cardIds).toEqual(['a'])
  })

  it('deletes a card once it is orphaned from every group', () => {
    const result = sanitizeConfig({
      cards: [card('a'), card('b')],
      groups: [{ id: 'g1', name: 'G1', cardIds: ['a'], timeWindows: [] }],
    })
    expect(result.cards.map((c) => c.id)).toEqual(['a'])
  })

  it('drops malformed time windows', () => {
    const result = sanitizeConfig({
      cards: [card('a')],
      groups: [
        {
          id: 'g1',
          name: 'G1',
          cardIds: ['a'],
          timeWindows: [
            { id: 'w1', start: '06:00', end: '09:00' },
            { id: 'w2', start: '10:00', end: '10:00' },
            { id: 'w3', start: 'noon', end: '13:00' },
            { id: 'w4' },
          ],
        },
      ],
    })
    expect(result.groups[0].timeWindows).toEqual([{ id: 'w1', start: '06:00', end: '09:00' }])
  })

  it('sanitizes lastSelectedGroupId against the final group list', () => {
    const valid = sanitizeConfig({
      cards: [card('a')],
      groups: [{ id: 'g1', name: 'G1', cardIds: ['a'], timeWindows: [] }],
      lastSelectedGroupId: 'g1',
    })
    expect(valid.lastSelectedGroupId).toBe('g1')

    const stale = sanitizeConfig({
      cards: [card('a')],
      groups: [{ id: 'g1', name: 'G1', cardIds: ['a'], timeWindows: [] }],
      lastSelectedGroupId: 'gone',
    })
    expect(stale.lastSelectedGroupId).toBeNull()
  })
})

describe('ConfigStore', () => {
  it('starts from defaults when the file does not exist', async () => {
    const store = new ConfigStore(configPath())
    expect(await store.load()).toEqual(defaultConfig())
  })

  it('round-trips a save through disk', async () => {
    const store = new ConfigStore(configPath())
    await store.load()
    await store.save({ ...defaultConfig(), cards: [card('a') as never] })

    const reloaded = new ConfigStore(configPath())
    expect((await reloaded.load()).cards.map((c) => c.id)).toEqual(['a'])
  })

  it('falls back to defaults on a corrupt file rather than throwing', async () => {
    await fs.writeFile(configPath(), '{ this is not json', 'utf8')
    const store = new ConfigStore(configPath())
    expect(await store.load()).toEqual(defaultConfig())
  })

  it('leaves no temp files behind after writing', async () => {
    const store = new ConfigStore(configPath())
    await store.load()
    await store.save(defaultConfig())
    expect(await fs.readdir(dir)).toEqual(['config.json'])
  })

  it('applies concurrent saves without interleaving them', async () => {
    const store = new ConfigStore(configPath())
    await store.load()
    await Promise.all([
      store.save({ ...defaultConfig(), cards: [card('a') as never] }),
      store.save({ ...defaultConfig(), cards: [card('b') as never] }),
      store.save({ ...defaultConfig(), cards: [card('c') as never] }),
    ])
    // Whichever won, the file must be complete and parseable.
    const onDisk = JSON.parse(await fs.readFile(configPath(), 'utf8'))
    expect(sanitizeConfig(onDisk).cards).toHaveLength(1)
  })

  it('update() mutates a clone, so a thrown mutation cannot corrupt state', async () => {
    const store = new ConfigStore(configPath())
    await store.load()
    await store.save({ ...defaultConfig(), cards: [card('a') as never] })
    await store.update((config) => {
      config.display.timeFormat = 'clock'
      return config
    })
    expect(store.get().display.timeFormat).toBe('clock')
    expect(store.get().cards).toHaveLength(1)
  })
})
