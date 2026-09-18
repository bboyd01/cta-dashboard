#!/usr/bin/env node
/**
 * Refresh the Metra schedule from the GTFS static feed.
 *
 * The server does this itself on boot when the cached copy is missing or stale;
 * this is the manual escape hatch for refreshing it on demand.
 */

import { loadEnv } from '../server/env.ts'
import { loadMetraSchedule } from '../server/metra/schedule.ts'

const env = loadEnv()
const file = await loadMetraSchedule(env.metraSchedulePath, env.metraApiKey, { force: true })

if (file.source === 'gtfs') {
  console.log(`Wrote ${file.stations.length} stations to ${env.metraSchedulePath}`)
} else {
  console.error(`Could not reach the Metra GTFS feed; ${env.metraSchedulePath} was not updated.`)
  process.exit(1)
}
