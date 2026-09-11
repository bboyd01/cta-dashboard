/**
 * Digest scheduling on a plain interval — no cron dependency, no job registry.
 *
 * Rules live in the config file and are re-read every tick, so editing a digest
 * in the UI takes effect immediately with nothing to re-register.
 *
 * Two details make this survive real operation:
 *  - A rule stays due for a grace period after its time, so a tick that drifts
 *    or a container that restarts at 06:02 still sends the 06:00 digest.
 *  - `lastSent` holds a Chicago day key and is persisted, so neither a restart
 *    nor the grace window can produce a second message on the same day.
 */

import type { Config, DigestRule } from '../../shared/types.ts'
import { dayKey, hhmm, weekday } from '../../shared/time.ts'
import type { ConfigStore } from '../config-store.ts'
import type { TtlCache } from '../cache.ts'
import type { CtaProvider } from '../cta/types.ts'
import { loadDepartures } from '../departures.ts'
import { buildDigestMessage, sendToDiscord } from './discord.ts'

const TICK_MS = 60_000
const GRACE_MINUTES = 5

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** Exported for tests: the rules that should fire at `now`. */
export function dueRules(config: Config, now: Date): DigestRule[] {
  const today = dayKey(now)
  const nowMinutes = toMinutes(hhmm(now))
  const day = weekday(now)

  return config.digests.filter((rule) => {
    if (!rule.enabled || rule.cardIds.length === 0) return false
    if (!rule.days.includes(day)) return false
    if (rule.lastSent === today) return false
    const elapsed = nowMinutes - toMinutes(rule.time)
    return elapsed >= 0 && elapsed <= GRACE_MINUTES
  })
}

export type SchedulerDeps = {
  store: ConfigStore
  provider: CtaProvider
  cache: TtlCache
  webhookUrl: string
  send?: typeof sendToDiscord
  now?: () => Date
}

/** Runs one pass. Exported so tests can drive it without timers. */
export async function runDigestTick(deps: SchedulerDeps): Promise<DigestRule[]> {
  const now = deps.now?.() ?? new Date()
  const send = deps.send ?? sendToDiscord
  const config = deps.store.get()
  const due = dueRules(config, now)
  if (due.length === 0) return []

  const sent: DigestRule[] = []
  for (const rule of due) {
    const cards = config.cards.filter((card) => rule.cardIds.includes(card.id))
    if (cards.length === 0) continue

    try {
      // Digests bypass the 30s cache: a message is worth one guaranteed-fresh call.
      const results = await loadDepartures(cards, deps.provider, deps.cache, now, { fresh: true })
      await send(deps.webhookUrl, buildDigestMessage(rule, cards, results, now))
      sent.push(rule)
    } catch (error) {
      // Leave lastSent unset so the next tick retries inside the grace window.
      console.error(`[digest] "${rule.name}" failed to send:`, error)
      continue
    }
  }

  if (sent.length > 0) {
    const today = dayKey(now)
    const sentIds = new Set(sent.map((rule) => rule.id))
    await deps.store.update((current) => ({
      ...current,
      digests: current.digests.map((rule) =>
        sentIds.has(rule.id) ? { ...rule, lastSent: today } : rule,
      ),
    }))
  }
  return sent
}

/** Starts the interval. Returns a stop function; a no-op when Discord is unset. */
export function startDigestScheduler(deps: SchedulerDeps): () => void {
  if (!deps.webhookUrl) return () => {}

  const timer = setInterval(() => {
    void runDigestTick(deps).catch((error) => {
      console.error('[digest] tick failed:', error)
    })
  }, TICK_MS)

  // Never hold the process open for a scheduler tick.
  timer.unref?.()
  return () => clearInterval(timer)
}
