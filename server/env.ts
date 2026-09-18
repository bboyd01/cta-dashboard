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
  /** True if METRA_API_KEY's raw value was wrapped in quotes we had to strip -- see `cleanValue`. */
  metraApiKeyHadQuotes: boolean
  discordWebhookUrl: string
  mock: boolean
  /** Short commit SHA of the running build, for confirming a deploy actually picked up new code. */
  buildVersion: string
}

function flag(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true'
}

/**
 * Trims whitespace and, if present, one matching pair of wrapping quotes.
 *
 * Docker Compose's `env_file:` does not strip quotes the way a shell or a
 * dotenv library would: `METRA_API_KEY="abc123"` in a `.env` file is passed
 * through with the quote characters literally part of the value. An API key
 * with two stray `"` characters is a different, invalid key -- and the
 * failure mode is exactly this confusing: an endpoint that doesn't check
 * auth at all still "succeeds" with the garbled value, and only the one that
 * does check it rejects it.
 */
function cleanValue(value: string | undefined): { value: string; hadQuotes: boolean } {
  const trimmed = value?.trim() ?? ''
  const quoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  return { value: quoted ? trimmed.slice(1, -1).trim() : trimmed, hadQuotes: quoted }
}

/**
 * A masked preview safe to put in /api/health: enough for someone to confirm
 * "yes, that's my key" (or spot that it isn't) without the full secret ever
 * leaving the server.
 */
export function keyFingerprint(key: string): string | null {
  if (!key) return null
  if (key.length <= 4) return `(${key.length} chars)`
  return `${key.slice(0, 2)}…${key.slice(-2)} (${key.length} chars)`
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
    trainApiKey: cleanValue(source.CTA_TRAIN_API_KEY).value,
    busApiKey: cleanValue(source.CTA_BUS_API_KEY).value,
    metraApiKey: cleanValue(source.METRA_API_KEY).value,
    metraApiKeyHadQuotes: cleanValue(source.METRA_API_KEY).hadQuotes,
    discordWebhookUrl: cleanValue(source.DISCORD_WEBHOOK_URL).value,
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
  if (env.metraApiKeyHadQuotes) {
    warnings.push(
      'METRA_API_KEY was wrapped in quotes and they were stripped -- if that key stopped ' +
        'working, double check your .env file does not need them (Docker Compose\'s env_file ' +
        'passes quote characters through literally, unlike a shell or dotenv).',
    )
  }
  if (!env.discordWebhookUrl) {
    warnings.push('DISCORD_WEBHOOK_URL is not set — Discord digests are disabled.')
  }
  return warnings
}
