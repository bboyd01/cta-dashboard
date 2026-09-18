/**
 * Config persistence: cards, display options and digest rules in one JSON file.
 *
 * This is the whole "database". It is a few KB for a single user, so a file plus
 * an in-memory copy beats any engine here. Two things make that safe:
 *
 *  - Writes are atomic (temp file + rename), so a crash or a full disk mid-write
 *    can never leave a truncated config behind.
 *  - Reads are sanitized field by field, so a hand-edit or an older schema
 *    degrades to defaults instead of crashing the server on boot.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  Card,
  CardKind,
  Config,
  ColumnSetting,
  DigestRule,
  DisplayOptions,
  Group,
  MobileColumnSetting,
  TimeFormat,
  TimeWindow,
} from '../shared/types.ts'

const TIME_FORMATS: TimeFormat[] = ['countdown', 'clock']
const COLUMN_SETTINGS: ColumnSetting[] = ['auto', '1', '2', '3', '4']
const MOBILE_COLUMN_SETTINGS: MobileColumnSetting[] = ['auto', '1', '2']
const CARD_KINDS: CardKind[] = ['train', 'bus', 'metra']

/**
 * Creates the data directory and proves we can write to it.
 *
 * Throws rather than warns on purpose. A read-only mount otherwise fails only
 * on the first save, which is caught and logged -- so the UI accepts the change,
 * the in-memory copy reflects it, and the loss only surfaces after a restart.
 * A container that refuses to start is much easier to diagnose than settings
 * that quietly do not stick.
 */
export async function ensureDataDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  const probe = path.join(dir, `.write-probe-${process.pid}`)
  try {
    await fs.writeFile(probe, '')
  } finally {
    await fs.rm(probe, { force: true }).catch(() => {})
  }
}

export function defaultConfig(): Config {
  return {
    cards: [],
    display: { timeFormat: 'countdown', columns: 'auto', mobileColumns: 'auto', departuresPerCard: 3 },
    digests: [],
    groups: [],
    lastSelectedGroupId: null,
  }
}

/* ---- field readers: each returns a fallback rather than throwing ---- */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value) ? (value as T) : fallback
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? Math.round(value) : Number.NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function sanitizeCard(raw: unknown): Card | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  const route = str(raw.route)
  if (!id || !route) return null
  const stopIds = strArray(raw.stopIds)
  if (stopIds.length === 0) return null
  return {
    id,
    kind: oneOf(raw.kind, CARD_KINDS, 'train'),
    route,
    title: str(raw.title, route),
    stationId: str(raw.stationId),
    stationName: str(raw.stationName),
    direction: typeof raw.direction === 'string' ? raw.direction : null,
    stopIds,
  }
}

function sanitizeDigest(raw: unknown): DigestRule | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  if (!id) return null
  const time = str(raw.time, '06:00')
  return {
    id,
    enabled: raw.enabled !== false,
    name: str(raw.name, 'Digest'),
    cardIds: strArray(raw.cardIds),
    days: Array.isArray(raw.days)
      ? [...new Set(raw.days.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6))]
      : [],
    time: /^\d{2}:\d{2}$/.test(time) ? time : '06:00',
    windowMinutes: int(raw.windowMinutes, 30, 5, 60),
    format: oneOf(raw.format, TIME_FORMATS, 'clock'),
    ...(typeof raw.lastSent === 'string' ? { lastSent: raw.lastSent } : {}),
  }
}

function sanitizeTimeWindow(raw: unknown): TimeWindow | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  if (!id) return null
  const start = str(raw.start)
  const end = str(raw.end)
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null
  if (start >= end) return null
  return { id, start, end }
}

function sanitizeGroup(raw: unknown, cardIds: Set<string>): Group | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  if (!id) return null
  return {
    id,
    name: str(raw.name, 'Group'),
    cardIds: strArray(raw.cardIds).filter((cid) => cardIds.has(cid)),
    timeWindows: Array.isArray(raw.timeWindows)
      ? raw.timeWindows.map(sanitizeTimeWindow).filter((w): w is TimeWindow => w !== null)
      : [],
  }
}

function sanitizeDisplay(raw: unknown): DisplayOptions {
  const base = defaultConfig().display
  if (!isRecord(raw)) return base
  return {
    timeFormat: oneOf(raw.timeFormat, TIME_FORMATS, base.timeFormat),
    columns: oneOf(raw.columns, COLUMN_SETTINGS, base.columns),
    mobileColumns: oneOf(raw.mobileColumns, MOBILE_COLUMN_SETTINGS, base.mobileColumns),
    departuresPerCard: int(raw.departuresPerCard, base.departuresPerCard, 1, 6),
  }
}

export function sanitizeConfig(raw: unknown): Config {
  if (!isRecord(raw)) return defaultConfig()
  let cards = Array.isArray(raw.cards)
    ? raw.cards.map(sanitizeCard).filter((c): c is Card => c !== null)
    : []
  let cardIds = new Set(cards.map((c) => c.id))

  let groups: Group[]
  if (!Array.isArray(raw.groups)) {
    // Pre-groups config: migrate every existing card into one default group
    // rather than losing it, so nothing disappears from the dashboard.
    groups =
      cards.length > 0
        ? [{ id: 'group_all', name: 'All', cardIds: cards.map((c) => c.id), timeWindows: [] }]
        : []
  } else {
    groups = raw.groups
      .map((g) => sanitizeGroup(g, cardIds))
      .filter((g): g is Group => g !== null)
  }

  // A card no longer referenced by any group is orphaned and gets dropped -- but
  // only once groups actually exist, so a config mid-migration never gets wiped.
  if (groups.length > 0) {
    const referenced = new Set(groups.flatMap((g) => g.cardIds))
    cards = cards.filter((c) => referenced.has(c.id))
    cardIds = new Set(cards.map((c) => c.id))
    groups = groups.map((g) => ({ ...g, cardIds: g.cardIds.filter((id) => cardIds.has(id)) }))
  }

  const digests = Array.isArray(raw.digests)
    ? raw.digests
        .map(sanitizeDigest)
        .filter((d): d is DigestRule => d !== null)
        // Drop references to cards that no longer exist so a digest can never
        // silently send a message about a deleted card.
        .map((d) => ({ ...d, cardIds: d.cardIds.filter((id) => cardIds.has(id)) }))
    : []

  const lastSelectedGroupId =
    typeof raw.lastSelectedGroupId === 'string' && groups.some((g) => g.id === raw.lastSelectedGroupId)
      ? raw.lastSelectedGroupId
      : null

  return { cards, display: sanitizeDisplay(raw.display), digests, groups, lastSelectedGroupId }
}

export class ConfigStore {
  #filePath: string
  #config: Config = defaultConfig()
  /** Serializes writes so two concurrent saves cannot interleave. */
  #queue: Promise<unknown> = Promise.resolve()

  constructor(filePath: string) {
    this.#filePath = filePath
  }

  get(): Config {
    return this.#config
  }

  /** Reads from disk, falling back to defaults for a missing or damaged file. */
  async load(): Promise<Config> {
    try {
      const text = await fs.readFile(this.#filePath, 'utf8')
      this.#config = sanitizeConfig(JSON.parse(text))
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        console.warn(`[config] ${this.#filePath} unreadable, using defaults:`, error)
      }
      this.#config = defaultConfig()
    }
    return this.#config
  }

  async save(next: Config): Promise<Config> {
    this.#config = sanitizeConfig(next)
    const snapshot = this.#config
    this.#queue = this.#queue.then(() => this.#write(snapshot)).catch((error) => {
      console.error('[config] write failed:', error)
    })
    await this.#queue
    return snapshot
  }

  /** Read-modify-write against the in-memory copy. Used by the digest scheduler. */
  async update(mutate: (config: Config) => Config): Promise<Config> {
    return this.save(mutate(structuredClone(this.#config)))
  }

  async #write(config: Config): Promise<void> {
    await fs.mkdir(path.dirname(this.#filePath), { recursive: true })
    const temp = `${this.#filePath}.${process.pid}.tmp`
    await fs.writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    await fs.rename(temp, this.#filePath)
  }
}
