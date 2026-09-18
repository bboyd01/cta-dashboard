import { describe, it, expect } from 'vitest'
import { withApiToken } from './auth-url.ts'

describe('withApiToken', () => {
  it('leaves a "|" in the key unencoded, unlike URLSearchParams', () => {
    const url = withApiToken('https://example.com/gtfs/public/tripupdates', '576|Ptabc123')
    expect(url.href).toBe('https://example.com/gtfs/public/tripupdates?api_token=576|Ptabc123')
    expect(url.href).not.toContain('%7C')
  })

  it('still encodes characters that would otherwise break the URL', () => {
    const url = withApiToken('https://example.com/x', 'a&b=c#d e')
    expect(url.searchParams.get('api_token')).toBe('a&b=c#d e')
    expect(url.href).not.toContain(' ')
  })

  it('appends with "&" when the URL already has a query string', () => {
    const url = withApiToken('https://example.com/x?foo=bar', 'key')
    expect(url.href).toBe('https://example.com/x?foo=bar&api_token=key')
  })

  it('returns the bare URL unmodified when no key is given', () => {
    const url = withApiToken('https://example.com/x', '')
    expect(url.href).toBe('https://example.com/x')
  })
})
