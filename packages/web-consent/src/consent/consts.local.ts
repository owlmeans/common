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

/** A pill button: 44px tall at minimum, full width on a phone, sharing the row above that. */
export const PILL = 'inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-6 py-2.5 text-[15px] transition-colors motion-safe:active:scale-[0.98] ' + FOCUS

/** A bar's pill: full width on a phone, its own width beside the others above that. */
export const BAR_PILL = 'inline-flex min-h-11 w-full items-center justify-center rounded-full px-6 py-2.5 text-center text-[15px] transition-colors motion-safe:active:scale-[0.98] sm:w-auto ' + FOCUS

/** The accent action. On the bar both answers carry it — refusing is exactly as prominent as accepting. */
export const ACCENT = 'bg-primary font-bold text-primary-foreground hover:bg-primary/90'

/** The secondary action: an outlined pill on the host's ink. */
export const OUTLINED = 'border-[1.5px] border-foreground bg-transparent font-semibold text-foreground hover:bg-muted'

/** A text link: muted, underlined at rest (colour is never the only signal), 44px tall to tap. */
export const LINK = 'inline-flex min-h-11 items-center font-semibold underline decoration-1 underline-offset-4 transition-colors hover:text-foreground hover:decoration-2 ' + FOCUS

/** How long a lookup may run before the spinner shows — a quick answer should not flash one. */
export const CONSENT_LOCATING_DELAY = 300

/** What Tab may reach inside an open consent surface. */
export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
