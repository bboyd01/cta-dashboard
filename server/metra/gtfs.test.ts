import { describe, it, expect } from 'vitest'
import { parseCsv } from './gtfs.ts'

describe('parseCsv', () => {
  it('parses a plain CSV into header-keyed rows', () => {
    const rows = parseCsv('stop_id,stop_name\nNAP,Naperville\nCUS,Chicago Union Station\n')
    expect(rows).toEqual([
      { stop_id: 'NAP', stop_name: 'Naperville' },
      { stop_id: 'CUS', stop_name: 'Chicago Union Station' },
    ])
  })

  it('handles quoted fields with embedded commas and escaped quotes', () => {
    const rows = parseCsv('a,b\n"1,2","she said ""hi"""\n')
    expect(rows).toEqual([{ a: '1,2', b: 'she said "hi"' }])
  })

  it('strips a leading UTF-8 BOM', () => {
    const rows = parseCsv('﻿a,b\n1,2\n')
    expect(rows).toEqual([{ a: '1', b: '2' }])
  })

  it('handles a file with no trailing newline', () => {
    const rows = parseCsv('a,b\n1,2')
    expect(rows).toEqual([{ a: '1', b: '2' }])
  })

  it('returns an empty array for an empty file', () => {
    expect(parseCsv('')).toEqual([])
  })
})
