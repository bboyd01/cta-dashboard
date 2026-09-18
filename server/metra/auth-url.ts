/**
 * Appends `api_token=<key>` to a Metra URL the way curl or a browser would --
 * critically, *not* the way `URLSearchParams` would.
 *
 * Metra's issued keys can contain a `|` (observed format: `<id>|<secret>`).
 * `URLSearchParams.set()` (and plain `encodeURIComponent`) percent-encode
 * `|` to `%7C`, which is spec-correct but not what a human testing the same
 * URL with curl ever sends -- curl leaves `|` in a URL raw. If Metra's own
 * server does anything even slightly non-standard reading the query string
 * (never decoding it, or comparing before decoding), a request with `%7C`
 * and one with a literal `|` can be treated as two different, non-matching
 * tokens. This mirrors exactly what a manual curl test sends: everything
 * else about the key still gets encoded (so a stray `&`, `#`, or `%` can't
 * break the URL), only `|` is deliberately left alone.
 */
export function withApiToken(url: string, apiKey: string): URL {
  if (!apiKey) return new URL(url)
  const separator = url.includes('?') ? '&' : '?'
  const safeKey = encodeURIComponent(apiKey).replace(/%7C/g, '|')
  return new URL(`${url}${separator}api_token=${safeKey}`)
}

/**
 * Node's built-in `fetch` sends no `User-Agent` header at all by default.
 * Some bot-management layers (Azure's Application Gateway/WAF among them)
 * treat a missing UA as a signal of automated/malicious traffic and block
 * the request before it ever reaches the actual application -- a 403 from
 * the gateway itself, unrelated to whether the API key is valid. A real,
 * descriptive UA is also just good practice for a server-to-server client.
 */
export const METRA_REQUEST_HEADERS: Record<string, string> = {
  'user-agent': 'cta-dashboard/1.0 (+https://github.com/bboyd01/cta-dashboard)',
  accept: 'application/x-protobuf, application/zip, text/plain, */*',
}
