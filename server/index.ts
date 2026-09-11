/**
 * Server entry point: one process serving the API, the built client and the
 * digest scheduler. That is what keeps this deployable as a single container.
 */

import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv, envWarnings } from './env.ts'
import { hasTimeZoneSupport, CHICAGO } from '../shared/time.ts'
import { ConfigStore, ensureDataDir } from './config-store.ts'
import { TtlCache } from './cache.ts'
import { createProvider } from './cta/index.ts'
import { StationIndex, loadStations } from './stations/index.ts'
import { createApiRouter } from './routes/api.ts'
import { startDigestScheduler } from './digest/scheduler.ts'

/** Matches the client's poll interval: one upstream call per window at most. */
const PREDICTION_TTL_MS = 30_000

const here = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.resolve(here, '../client')

export async function createServer() {
  const env = loadEnv()
  for (const warning of envWarnings(env)) console.warn(`[env] ${warning}`)

  // Without this the times would still render, just silently wrong by hours.
  if (!hasTimeZoneSupport()) {
    console.error(
      `[time] This Node build cannot resolve ${CHICAGO}. Every departure time will be ` +
        'wrong. Use a Node build with full ICU (the official node images have it).',
    )
  }

  try {
    await ensureDataDir(env.dataDir)
  } catch (error) {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 'this process'
    throw new Error(
      `Cannot write to DATA_DIR (${env.dataDir}) as uid ${uid}: ` +
        `${error instanceof Error ? error.message : String(error)}\n` +
        'Settings and the station cache live there. If you mounted a host directory, ' +
        'give it to the container user: chown -R 1000:1000 <that directory>. ' +
        'A named volume needs no such step.',
      { cause: error },
    )
  }

  const store = new ConfigStore(env.configPath)
  await store.load()

  let stations = new StationIndex(await loadStations(env.stationsPath))
  if (stations.isSeed) {
    console.warn(
      '[stations] running on the bundled seed — only a few stations are offered in the picker.',
    )
  }

  const cache = new TtlCache(PREDICTION_TTL_MS)
  const provider = createProvider(env, () => stations)

  const app = express()
  app.use(express.json({ limit: '256kb' }))
  app.use(
    '/api',
    createApiRouter({
      store,
      provider,
      cache,
      stations: () => stations,
      mock: env.mock,
      discordConfigured: Boolean(env.discordWebhookUrl),
    }),
  )

  // Static assets are content-hashed by Vite, so they can be cached hard; the
  // HTML entry point must not be, or a deploy never reaches an open tab.
  app.use(express.static(clientDir, { index: false, maxAge: '1y', immutable: true }))
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'))
  })

  const stopDigests = startDigestScheduler({
    store,
    provider,
    cache,
    webhookUrl: env.discordWebhookUrl,
  })

  return { app, env, store, stopDigests }
}

const isEntryPoint = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))

if (isEntryPoint) {
  const { app, env } = await createServer()
  app.listen(env.port, () => {
    console.log(`[server] CTA Dashboard listening on http://localhost:${env.port}`)
  })
}
