/** Environment parsing. Read once at startup so misconfiguration fails loudly. */

import path from 'node:path'

export type Env = {
  port: number
  dataDir: string
  configPath: string
  stationsPath: string
  metraSchedulePath: string
  trainApiKey: string
  busApiKey: string
  metraApiKey: string
  discordWebhookUrl: string
  mock: boolean
}

function flag(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true'
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const dataDir = path.resolve(source.DATA_DIR ?? './data')
  const mock = flag(source.CTA_MOCK)

  const env: Env = {
    port: Number(source.PORT ?? 3000),
    dataDir,
    configPath: path.join(dataDir, 'config.json'),
    stationsPath: path.join(dataDir, 'stations.json'),
    metraSchedulePath: path.join(dataDir, 'metra-schedule.json'),
    trainApiKey: source.CTA_TRAIN_API_KEY?.trim() ?? '',
    busApiKey: source.CTA_BUS_API_KEY?.trim() ?? '',
    metraApiKey: source.METRA_API_KEY?.trim() ?? '',
    discordWebhookUrl: source.DISCORD_WEBHOOK_URL?.trim() ?? '',
    mock,
  }

  if (!Number.isFinite(env.port) || env.port <= 0) {
    throw new Error(`PORT must be a positive number, got ${JSON.stringify(source.PORT)}`)
  }
  return env
}

/**
 * Warnings worth printing at boot. Missing keys are not fatal: the dashboard
 * still serves, the affected cards just report an error, and that is far easier
 * to diagnose than a container that refuses to start.
 */
export function envWarnings(env: Env): string[] {
  const warnings: string[] = []
  if (env.mock) {
    warnings.push('CTA_MOCK is on — serving fixture data, no CTA requests will be made.')
  } else {
    if (!env.trainApiKey) warnings.push('CTA_TRAIN_API_KEY is not set — train cards will not load.')
    if (!env.busApiKey) warnings.push('CTA_BUS_API_KEY is not set — bus cards will not load.')
    if (!env.metraApiKey) warnings.push('METRA_API_KEY is not set — Metra cards will not load.')
  }
  if (!env.discordWebhookUrl) {
    warnings.push('DISCORD_WEBHOOK_URL is not set — Discord digests are disabled.')
  }
  return warnings
}
