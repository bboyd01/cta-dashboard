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
  /** Short commit SHA of the running build, for confirming a deploy actually picked up new code. */
  buildVersion: string
}

function flag(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true'
}

/**
 * Best-effort commit identifier for /api/health, so "did my redeploy actually
 * take?" has a real answer instead of a guess. `GIT_SHA` is what this repo's
 * own Dockerfile/docker-compose.yml stamp in (see README); the rest are set
 * automatically, with no configuration, by common PaaS platforms that build
 * straight from a git push.
 */
function detectBuildVersion(source: NodeJS.ProcessEnv): string {
  return (
    source.GIT_SHA ??
    source.SOURCE_COMMIT ??
    source.RENDER_GIT_COMMIT ??
    source.RAILWAY_GIT_COMMIT_SHA ??
    source.VERCEL_GIT_COMMIT_SHA ??
    source.HEROKU_SLUG_COMMIT ??
    'unknown'
  ).trim().slice(0, 12) || 'unknown'
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
    buildVersion: detectBuildVersion(source),
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
