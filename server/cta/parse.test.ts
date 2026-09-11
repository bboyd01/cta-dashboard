import { describe, it, expect } from 'vitest'
import { parseTrainArrivals } from './train.ts'
import { parseBusPredictions } from './bus.ts'
import { parseTrainTimestamp, parseBusTimestamp, truthy } from './http.ts'
import { CtaError } from './types.ts'

describe('timestamp parsing', () => {
  it('reads a train timestamp as Chicago wall clock', () => {
    // 06:42 CDT in September is 11:42 UTC.
    expect(parseTrainTimestamp('2026-09-11T06:42:30')).toBe('2026-09-11T11:42:30.000Z')
  })

  it('reads a bus timestamp as Chicago wall clock', () => {
    expect(parseBusTimestamp('20260911 06:42')).toBe('2026-09-11T11:42:00.000Z')
  })

  it('accepts the seconds-resolution bus timestamp', () => {
    expect(parseBusTimestamp('20260911 06:42:30')).toBe('2026-09-11T11:42:30.000Z')
  })

  it('returns null rather than an Invalid Date for junk', () => {
    expect(parseTrainTimestamp('tomorrow-ish')).toBeNull()
    expect(parseTrainTimestamp(undefined)).toBeNull()
    expect(parseBusTimestamp('')).toBeNull()
  })

  it('treats the feeds’ mixed boolean encodings alike', () => {
    expect(truthy('1')).toBe(true)
    expect(truthy(true)).toBe(true)
    expect(truthy('0')).toBe(false)
    expect(truthy(undefined)).toBe(false)
  })
})

describe('parseTrainArrivals', () => {
  const payload = (eta: unknown, overrides = {}) => ({
    ctatt: { tmst: '2026-09-11T06:40:00', errCd: '0', errNm: null, eta, ...overrides },
  })

  const eta = {
    staId: '41320', stpId: '30226', staNm: 'Western', stpDe: 'Service toward Loop',
    rn: '418', rt: 'Brn', destSt: '30173', destNm: 'Loop', trDr: '5',
    prdt: '2026-09-11T06:40:00', arrT: '2026-09-11T06:47:00',
    isApp: '0', isSch: '0', isDly: '0', isFlt: '0',
  }

  it('normalizes an arrival', () => {
    expect(parseTrainArrivals(payload([eta]))).toEqual([
      {
        route: 'Brn',
        destination: 'Loop',
        arrivalAt: '2026-09-11T11:47:00.000Z',
        isApproaching: false,
        isDelayed: false,
        isScheduled: false,
        stopId: '30226',
        direction: '5',
      },
    ])
  })

  it('reads the approaching, delayed and scheduled flags', () => {
    const [result] = parseTrainArrivals(
      payload([{ ...eta, isApp: '1', isDly: '1', isSch: '1' }]),
    )
    expect(result).toMatchObject({ isApproaching: true, isDelayed: true, isScheduled: true })
  })

  it('accepts a bare object when exactly one train is due', () => {
    // The feed drops the array wrapper for a single result.
    expect(parseTrainArrivals(payload(eta))).toHaveLength(1)
  })

  it('returns empty when no trains are predicted', () => {
    expect(parseTrainArrivals(payload(undefined))).toEqual([])
  })

  it('skips a row with an unparseable time instead of failing the card', () => {
    expect(parseTrainArrivals(payload([{ ...eta, arrT: 'soon' }, eta]))).toHaveLength(1)
  })

  it('surfaces the upstream error message', () => {
    expect(() =>
      parseTrainArrivals(payload([], { errCd: '107', errNm: 'Invalid API key' })),
    ).toThrow(/Invalid API key/)
  })

  it('rejects a response that is not a ttarrivals payload', () => {
    expect(() => parseTrainArrivals({ nope: true })).toThrow(CtaError)
  })
})

describe('parseBusPredictions', () => {
  const wrap = (body: Record<string, unknown>) => ({ 'bustime-response': body })

  const prd = {
    tmstmp: '20260911 06:40', typ: 'A', stpnm: 'Western & Armitage', stpid: '456',
    vid: '1234', dstp: 1234, rt: '49', rtdd: '49', rtdir: 'Northbound', des: 'Berwyn',
    prdtm: '20260911 06:47', dly: false, prdctdn: '7',
  }

  it('normalizes a prediction', () => {
    expect(parseBusPredictions(wrap({ prd: [prd] }))).toEqual([
      {
        route: '49',
        destination: 'Berwyn',
        arrivalAt: '2026-09-11T11:47:00.000Z',
        isApproaching: false,
        isDelayed: false,
        isScheduled: false,
        stopId: '456',
        direction: 'Northbound',
      },
    ])
  })

  it('treats the DUE countdown as approaching', () => {
    expect(parseBusPredictions(wrap({ prd: [{ ...prd, prdctdn: 'DUE' }] }))[0].isApproaching)
      .toBe(true)
  })

  it('reads delay from either the flag or the countdown', () => {
    expect(parseBusPredictions(wrap({ prd: [{ ...prd, dly: true }] }))[0].isDelayed).toBe(true)
    expect(parseBusPredictions(wrap({ prd: [{ ...prd, prdctdn: 'DLY' }] }))[0].isDelayed).toBe(true)
  })

  it('marks a schedule-based estimate', () => {
    expect(parseBusPredictions(wrap({ prd: [{ ...prd, typ: 'S' }] }))[0].isScheduled).toBe(true)
  })

  it('prefers the public route designator over the internal code', () => {
    expect(parseBusPredictions(wrap({ prd: [{ ...prd, rt: 'x49', rtdd: 'X49' }] }))[0].route)
      .toBe('X49')
  })

  it('keeps good stops when one stop id in the batch errors', () => {
    const body = wrap({ prd: [prd], error: [{ stpid: '999', msg: 'No service scheduled' }] })
    expect(parseBusPredictions(body)).toHaveLength(1)
  })

  it('throws when the whole request errored', () => {
    expect(() => parseBusPredictions(wrap({ error: [{ msg: 'Invalid API access key' }] })))
      .toThrow(/Invalid API access key/)
  })

  it('accepts a bare object for a single prediction', () => {
    expect(parseBusPredictions(wrap({ prd }))).toHaveLength(1)
  })

  it('rejects a response missing the envelope', () => {
    expect(() => parseBusPredictions({ prd: [] })).toThrow(CtaError)
  })
})
