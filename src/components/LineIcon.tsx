/** Train and bus glyphs. Inline SVG so they inherit the badge's text color. */

export function LineIcon({ kind }: { kind: 'train' | 'bus' }) {
  return kind === 'train' ? <TrainGlyph /> : <BusGlyph />
}

function TrainGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
      <path d="M4 9h16" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8.5" cy="13.5" r="1.15" fill="currentColor" />
      <circle cx="15.5" cy="13.5" r="1.15" fill="currentColor" />
      <path
        d="m8 21 2.5-4m5.5 4-2.5-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      />
    </svg>
  )
}

function BusGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5V16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5.5Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
      <path d="M5 10h14" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8.5" cy="14" r="1.15" fill="currentColor" />
      <circle cx="15.5" cy="14" r="1.15" fill="currentColor" />
      <path d="M7.5 18v2m9-2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
