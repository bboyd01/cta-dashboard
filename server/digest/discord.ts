/**
 * Discord delivery via an incoming webhook.
 *
 * A webhook needs no bot, no gateway connection and no OAuth flow — the whole
 * integration is one URL in an env var and one POST.
 */

import type { Card, CardDepartures, DigestRule } from '../../shared/types.ts'
import { formatDeparture, withinWindow } from '../../shared/format.ts'
import { accentFor } from '../../shared/lines.ts'

const SEND_TIMEOUT_MS = 10_000

export type DiscordEmbed = {
  title: string
  description: string
  color: number
}

export type DiscordMessage = {
  content: string
  embeds: DiscordEmbed[]
}

function colorToInt(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16)
}

function subtitle(card: Card): string {
  const where = card.stationName || card.stationId
  return card.direction ? `${where} · ${card.direction}` : `${where} · Both directions`
}

/**
 * One embed per card. A card with nothing in the window still gets a line, so an
 * empty digest is distinguishable from a digest that failed to send.
 */
export function buildDigestMessage(
  rule: DigestRule,
  cards: Card[],
  results: CardDepartures[],
  now: Date,
): DiscordMessage {
  const byId = new Map(results.map((r) => [r.cardId, r]))
  const embeds: DiscordEmbed[] = []

  for (const card of cards) {
    const result = byId.get(card.id)
    const accent = colorToInt(accentFor(card.route).color)

    let description: string
    if (result?.error) {
      description = `Could not load departures (${result.error}).`
    } else {
      const upcoming = withinWindow(result?.departures ?? [], now, rule.windowMinutes)
      description = upcoming.length
        ? upcoming
            .map((departure) => {
              const time = formatDeparture(departure, now, rule.format)
              const flags = [
                departure.isDelayed ? 'delayed' : '',
                departure.isScheduled ? 'scheduled' : '',
              ].filter(Boolean)
              const suffix = flags.length ? ` _(${flags.join(', ')})_` : ''
              return `**${time}** → ${departure.destination}${suffix}`
            })
            .join('\n')
        : `Nothing in the next ${rule.windowMinutes} minutes.`
    }

    embeds.push({ title: `${card.title} — ${subtitle(card)}`, description, color: accent })
  }

  return { content: `**${rule.name}**`, embeds }
}

/** POSTs to the webhook. Throws on failure so the caller can leave lastSent unset. */
export async function sendToDiscord(webhookUrl: string, message: DiscordMessage): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`Discord webhook returned HTTP ${response.status}`)
  }
}
