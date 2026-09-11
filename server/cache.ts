/**
 * TTL cache with in-flight de-duplication.
 *
 * This is what keeps the CTA rate limits survivable. Every upstream call goes
 * through it keyed by request, so N open browser tabs polling every 30s collapse
 * into one upstream request per TTL window. Because entries are filled lazily on
 * read, a dashboard nobody is looking at makes no upstream requests at all.
 */

type Entry<T> = { value: T; expiresAt: number }

export class TtlCache {
  #entries = new Map<string, Entry<unknown>>()
  #inFlight = new Map<string, Promise<unknown>>()
  #ttlMs: number
  #now: () => number

  constructor(ttlMs: number, now: () => number = Date.now) {
    this.#ttlMs = ttlMs
    this.#now = now
  }

  /** Returns the cached value, or calls `load` — sharing one call among concurrent callers. */
  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.#entries.get(key)
    if (cached && cached.expiresAt > this.#now()) return cached.value as T

    const pending = this.#inFlight.get(key)
    if (pending) return pending as Promise<T>

    const promise = load()
      .then((value) => {
        this.#entries.set(key, { value, expiresAt: this.#now() + this.#ttlMs })
        return value
      })
      .finally(() => {
        this.#inFlight.delete(key)
      })

    this.#inFlight.set(key, promise)
    return promise
  }

  /** Bypasses a live entry but still shares an in-flight load. Used by the digest. */
  async refresh<T>(key: string, load: () => Promise<T>): Promise<T> {
    this.#entries.delete(key)
    return this.get(key, load)
  }

  clear(): void {
    this.#entries.clear()
  }
}
