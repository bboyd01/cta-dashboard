import { describe, it, expect } from 'vitest'
import { loadEnv, keyFingerprint } from './env.ts'

const base = { PORT: '3000' }

describe('loadEnv buildVersion', () => {
  it('defaults to "unknown" with no git/platform env var set', () => {
    expect(loadEnv(base).buildVersion).toBe('unknown')
  })

  it('prefers our own GIT_SHA over a platform-provided one', () => {
    const env = loadEnv({ ...base, GIT_SHA: 'abc1234', RENDER_GIT_COMMIT: 'zzzzzzz' })
    expect(env.buildVersion).toBe('abc1234')
  })

  it('falls back to a platform-provided commit env var', () => {
    expect(loadEnv({ ...base, RAILWAY_GIT_COMMIT_SHA: 'deadbee' }).buildVersion).toBe('deadbee')
  })

  it('truncates a long SHA rather than exposing the full 40 characters', () => {
    const full = 'a'.repeat(40)
    expect(loadEnv({ ...base, GIT_SHA: full }).buildVersion).toHaveLength(12)
  })

  it('trims whitespace and treats an empty value as unset', () => {
    expect(loadEnv({ ...base, GIT_SHA: '   ' }).buildVersion).toBe('unknown')
  })
})

describe('loadEnv METRA_API_KEY quote stripping', () => {
  it('passes through a clean key unchanged', () => {
    const env = loadEnv({ ...base, METRA_API_KEY: 'abc123' })
    expect(env.metraApiKey).toBe('abc123')
    expect(env.metraApiKeyHadQuotes).toBe(false)
  })

  it('strips a Docker Compose env_file-style wrapping double quote', () => {
    const env = loadEnv({ ...base, METRA_API_KEY: '"abc123"' })
    expect(env.metraApiKey).toBe('abc123')
    expect(env.metraApiKeyHadQuotes).toBe(true)
  })

  it('strips a wrapping single quote', () => {
    const env = loadEnv({ ...base, METRA_API_KEY: "'abc123'" })
    expect(env.metraApiKey).toBe('abc123')
    expect(env.metraApiKeyHadQuotes).toBe(true)
  })

  it('does not strip a single leading or trailing quote (not a matched wrap)', () => {
    const env = loadEnv({ ...base, METRA_API_KEY: '"abc123' })
    expect(env.metraApiKey).toBe('"abc123')
    expect(env.metraApiKeyHadQuotes).toBe(false)
  })

  it('does not strip mismatched quote characters', () => {
    const env = loadEnv({ ...base, METRA_API_KEY: `"abc123'` })
    expect(env.metraApiKey).toBe(`"abc123'`)
    expect(env.metraApiKeyHadQuotes).toBe(false)
  })
})

describe('keyFingerprint', () => {
  it('returns null for an empty key', () => {
    expect(keyFingerprint('')).toBeNull()
  })

  it('masks the middle of a normal-length key', () => {
    expect(keyFingerprint('abcdefghijklmnopqr')).toBe('ab…qr (18 chars)')
  })

  it('never includes the full value of a short key', () => {
    expect(keyFingerprint('abcd')).toBe('(4 chars)')
  })
})
