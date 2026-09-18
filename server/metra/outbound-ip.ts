/**
 * The dashboard server's own outbound public IP, for diagnosing an IP-based
 * block: Metra's realtime endpoint sits behind an Azure Application
 * Gateway/WAF, and a 403 from that layer (rather than Metra's own
 * application) can mean the gateway is blocking this server's IP or IP
 * range specifically, while a developer's own machine -- e.g. testing the
 * same request with curl -- is unaffected. Comparing this against the IP a
 * successful manual test came from confirms or rules that out; either way,
 * it's the IP Metra support would need to allowlist.
 */

import { TtlCache } from '../cache.ts'

const IP_ECHO_URL = 'https://api.ipify.org?format=text'
const FETCH_TIMEOUT_MS = 5_000
const CACHE_TTL_MS = 60 * 60 * 1000

const cache = new TtlCache(CACHE_TTL_MS)

export async function getOutboundIp(): Promise<string | null> {
  return cache.get('outbound-ip', async () => {
    try {
      const response = await fetch(IP_ECHO_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (!response.ok) return null
      const ip = (await response.text()).trim()
      return ip || null
    } catch {
      return null
    }
  })
}
