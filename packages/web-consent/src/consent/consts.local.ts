/**
 * The cookie preferences dialog, and the button that brings it back.
 *
 * Deliberately built from raw elements rather than shadcn primitives. One of the three surfaces
 * this serves is an Astro island on a site that vendors its own component library, and requiring a
 * consumer to install a UI family in order to render a consent notice would put the notice out of
 * reach of the site that needs it most.
 *
 * Flat by rule, because it is the first thing every new visitor of a generated app sees: the
 * surface and every colour come from the host's theme tokens (ground, ink, muted, hairline, one
 * accent), depth comes from a hairline border and the overlay alone, and nothing paints a
 * gradient, a shadow, a glow or a `backdrop-filter`. The accept action is the one accent pill,
 * the others are outlined pills; every control is at least 44px tall and shows a 3px focus ring.
 */
/**
 * The focus ring every control here shows: 3px solid in the theme's ring colour, 3px off the
 * element. An outline rather than a box-shadow ring, so it survives a host that zeroes shadows.
 */
export const FOCUS = 'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring'
