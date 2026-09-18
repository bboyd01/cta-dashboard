/**
 * Train, Metra and bus glyphs, drawn as solid silhouettes with the badge color
 * punched back through for windows and lights. Inline SVG so the body inherits
 * the badge's text color, and the knockouts read the badge's own background
 * from --card-accent rather than guessing a fill.
 *
 * The two trains stay front-on and the bus in profile: at badge size two
 * side-view vehicles are nearly indistinguishable, and the card's accent color
 * only tells you which line it is, not which mode. The bus was the one that
 * read wrong — a short body with a sloped nose is a van — so it is now drawn
 * with the proportions that make a bus a bus: long, flat-fronted, a
 * destination sign over the windshield and a row of equal windows. Metra's
 * bi-level coaches are boxier and taller than an 'L' car, which is what tells
 * the two train glyphs apart.
 */

export function LineIcon({ kind }: { kind: 'train' | 'bus' | 'metra' }) {
  if (kind === 'train') return <TrainGlyph />
  if (kind === 'metra') return <MetraGlyph />
  return <BusGlyph />
}

const SIZE = 20
const KNOCKOUT = 'var(--card-accent)'

/** Side view: long flat-fronted body, destination sign, four windows, wheels. */
function BusGlyph() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" aria-hidden="true">
      {/* Body: square front at the left, roof line flat the whole way. */}
      <path
        fill="currentColor"
        d="M4.2 3.8h15.6a2 2 0 0 1 2 2v8.1a1.7 1.7 0 0 1-1.7 1.7H3.9a1.7 1.7 0 0 1-1.7-1.7V5.8a2 2 0 0 1 2-2Z"
      />
      {/* Destination sign above the windshield. */}
      <rect x="3.8" y="5.3" width="6.4" height="1.4" rx="0.5" fill={KNOCKOUT} />
      {/* Windshield, then three side windows. */}
      <rect x="3.8" y="7.9" width="4.3" height="3.9" rx="0.6" fill={KNOCKOUT} />
      <rect x="9.1" y="7.9" width="3.5" height="3.9" rx="0.6" fill={KNOCKOUT} />
      <rect x="13.6" y="7.9" width="3.5" height="3.9" rx="0.6" fill={KNOCKOUT} />
      <rect x="18.1" y="7.9" width="2.2" height="3.9" rx="0.6" fill={KNOCKOUT} />
      {/* Wheels: clear of the body, so they read as wheels and not as a shadow. */}
      <circle cx="7" cy="17.1" r="2.7" fill="currentColor" />
      <circle cx="7" cy="17.1" r="1.05" fill={KNOCKOUT} />
      <circle cx="17" cy="17.1" r="2.7" fill="currentColor" />
      <circle cx="17" cy="17.1" r="1.05" fill={KNOCKOUT} />
    </svg>
  )
}

/**
 * Front view of a bi-level commuter coach: a boxier, taller cab than the 'L'
 * train, with a single wide windshield band and paired headlights up top —
 * the silhouette Metra's own gallery cars are known for.
 */
function MetraGlyph() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" aria-hidden="true">
      {/* Body: square shoulders, flat roof, taller than the 'L' car. */}
      <path
        fill="currentColor"
        d="M6.4 2.4h11.2a2.4 2.4 0 0 1 2.4 2.4v10.4a2.8 2.8 0 0 1-2.8 2.8H6.8A2.8 2.8 0 0 1 4 15.2V4.8a2.4 2.4 0 0 1 2.4-2.4Z"
      />
      {/* Headlights, up under the roofline. */}
      <circle cx="8.1" cy="5.1" r="1.05" fill={KNOCKOUT} />
      <circle cx="15.9" cy="5.1" r="1.05" fill={KNOCKOUT} />
      {/* One wide windshield band, the bi-level's signature look. */}
      <rect x="6.1" y="7.4" width="11.8" height="5.6" rx="1" fill={KNOCKOUT} />
      {/* Skirt stripe. */}
      <rect x="4" y="14.6" width="16" height="1.6" fill={KNOCKOUT} />
      {/* Rail below, with the trucks resting on it. */}
      <path
        d="M8.6 18.6 6.8 21M15.4 18.6 17.2 21"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      />
      <path d="M3.6 21.6h16.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** Front view: rounded cab, one wide window, two headlights, rails below. */
function TrainGlyph() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" aria-hidden="true">
      {/* Car front: shoulders rounded into a flat roof, skirt squared off. */}
      <path
        fill="currentColor"
        d="M12 2.4c-4.2 0-6.7 1.4-6.7 4.8v8.2a2.8 2.8 0 0 0 2.8 2.8h7.8a2.8 2.8 0 0 0 2.8-2.8V7.2c0-3.4-2.5-4.8-6.7-4.8Z"
      />
      {/* Windscreen. */}
      <rect x="7.5" y="6.2" width="9" height="4.4" rx="1" fill={KNOCKOUT} />
      {/* Headlights. */}
      <circle cx="9.3" cy="13.9" r="1.15" fill={KNOCKOUT} />
      <circle cx="14.7" cy="13.9" r="1.15" fill={KNOCKOUT} />
      {/* Rail below, with the trucks resting on it. */}
      <path
        d="M8.6 18.6 6.8 21M15.4 18.6 17.2 21"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      />
      <path d="M3.6 21.6h16.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
