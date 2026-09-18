/**
 * CTA line identity. `color` is the official line color; `onColor` is the text
 * color that sits on top of it.
 *
 * onColor is not cosmetic: white on Yellow (#F9E300) or Green (#009B3A) fails
 * contrast badly. Each line carries the readable pairing so no call site has to
 * special-case one line.
 */

import { isMetraLineId, METRA_LINES } from './metraLines.ts'

export type LineId = 'Red' | 'Blue' | 'Brn' | 'G' | 'Org' | 'P' | 'Pink' | 'Y'

export type LineInfo = {
  id: LineId
  name: string
  color: string
  onColor: string
  /** Key used by the Train Tracker API's `rt` filter. */
  rt: string
}

const WHITE = '#ffffff'
const INK = '#15181d'

export const LINES: Record<LineId, LineInfo> = {
  Red: { id: 'Red', name: 'Red Line', color: '#C60C30', onColor: WHITE, rt: 'Red' },
  Blue: { id: 'Blue', name: 'Blue Line', color: '#00A1DE', onColor: INK, rt: 'Blue' },
  Brn: { id: 'Brn', name: 'Brown Line', color: '#62361B', onColor: WHITE, rt: 'Brn' },
  G: { id: 'G', name: 'Green Line', color: '#009B3A', onColor: INK, rt: 'G' },
  Org: { id: 'Org', name: 'Orange Line', color: '#F9461C', onColor: INK, rt: 'Org' },
  P: { id: 'P', name: 'Purple Line', color: '#522398', onColor: WHITE, rt: 'P' },
  Pink: { id: 'Pink', name: 'Pink Line', color: '#E27EA6', onColor: INK, rt: 'Pink' },
  Y: { id: 'Y', name: 'Yellow Line', color: '#F9E300', onColor: INK, rt: 'Y' },
}

export const LINE_IDS = Object.keys(LINES) as LineId[]

/** Buses are deliberately not color-coded; they get one neutral accent. */
export const BUS_ACCENT = { color: '#3F4C5A', onColor: WHITE }

export function isLineId(value: string): value is LineId {
  return value in LINES
}

/** Accent for any card: 'L' train, Metra, or bus. */
export function accentFor(route: string): { color: string; onColor: string } {
  if (isLineId(route)) return LINES[route]
  if (isMetraLineId(route)) return METRA_LINES[route]
  return BUS_ACCENT
}
