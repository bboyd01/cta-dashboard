/**
 * Train and bus glyphs. Inline SVG so they inherit the badge's text color.
 *
 * The train is drawn front-on and the bus in profile: at 18px inside the badge,
 * two side-view vehicles are nearly indistinguishable, and the card's accent
 * color only tells you which line it is, not which mode.
 */

export function LineIcon({ kind }: { kind: 'train' | 'bus' }) {
  return kind === 'train' ? <TrainGlyph /> : <BusGlyph />
}

/** Front view: rounded cab, one wide window, two headlights, rails below. */
function TrainGlyph() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9a6 6 0 0 1 12 0v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9Z"
        stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"
      />
      <path
        d="M8.2 8.2h7.6v3.4H8.2z" fill="currentColor" opacity="0.9"
      />
      <circle cx="9.2" cy="15.4" r="1.1" fill="currentColor" />
      <circle cx="14.8" cy="15.4" r="1.1" fill="currentColor" />
      <path d="M4 21h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

/** Side view: long body, row of windows, two wheels on the road. */
function BusGlyph() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 8a3 3 0 0 1 3-3h10.2a3 3 0 0 1 2.4 1.2l1.8 2.4a3 3 0 0 1 .6 1.8V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"
        stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"
      />
      <path d="M6 8.4h6.4v3.2H6z" fill="currentColor" opacity="0.9" />
      <path d="M15 8.4h2.6l1.6 3.2H15z" fill="currentColor" opacity="0.9" />
      <circle cx="8" cy="18.4" r="1.9" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17" cy="18.4" r="1.9" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}
