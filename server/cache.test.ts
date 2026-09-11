import { describe, it, expect, vi } from 'vitest'
import { TtlCache } from './cache.ts'

describe('TtlCache', () => {
  it('serves a cached value without calling the loader again', async () => {
    const cache = new TtlCache(30_000)
    const load = vi.fn().mockResolvedValue('value')
    expect(await cache.get('k', load)).toBe('value')
    expect(await cache.get('k', load)).toBe('value')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('reloads once the TTL has passed', async () => {
    let now = 1_000
    const cache = new TtlCache(30_000, () => now)
    const load = vi.fn().mockResolvedValue('value')
    await cache.get('k', load)
    now += 31_000
    await cache.get('k', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('collapses concurrent callers into one upstream call', async () => {
    const cache = new TtlCache(30_000)
    let resolve: (v: string) => void = () => {}
    const load = vi.fn(() => new Promise<string>((r) => { resolve = r }))

    const all = Promise.all([cache.get('k', load), cache.get('k', load), cache.get('k', load)])
    resolve('shared')
    expect(await all).toEqual(['shared', 'shared', 'shared'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not cache a rejection, so a blip does not persist for the whole TTL', async () => {
    const cache = new TtlCache(30_000)
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('upstream down'))
      .mockResolvedValueOnce('recovered')

    await expect(cache.get('k', load)).rejects.toThrow('upstream down')
    expect(await cache.get('k', load)).toBe('recovered')
  })

  it('refresh() bypasses a live entry', async () => {
    const cache = new TtlCache(30_000)
    const load = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second')
    await cache.get('k', load)
    expect(await cache.refresh('k', load)).toBe('second')
  })

  it('keys entries independently', async () => {
    const cache = new TtlCache(30_000)
    expect(await cache.get('a', async () => 1)).toBe(1)
    expect(await cache.get('b', async () => 2)).toBe(2)
  })
})
