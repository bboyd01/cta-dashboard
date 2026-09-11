#!/usr/bin/env node
/**
 * Refresh the 'L' station list from the City of Chicago data portal.
 *
 * The server does this itself on boot when the cached copy is missing or stale;
 * this is the manual escape hatch for refreshing it on demand.
 */

import { loadEnv } from '../server/env.ts'
import { loadStations } from '../server/stations/index.ts'

const env = loadEnv()
const file = await loadStations(env.stationsPath, { force: true })

if (file.source === 'portal') {
  console.log(`Wrote ${file.stations.length} stations to ${env.stationsPath}`)
} else {
  console.error(`Could not reach the data portal; ${env.stationsPath} was not updated.`)
  process.exit(1)
}
