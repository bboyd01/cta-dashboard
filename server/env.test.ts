import { describe, it, expect } from 'vitest'
import { loadEnv } from './env.ts'

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
