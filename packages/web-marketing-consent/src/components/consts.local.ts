/** `{{link}}` is the definition's first link, `{{link2}}` its second, and so on. */
export const TOKEN = /\{\{\s*link(\d*)\s*\}\}/g

/** The media query a person's "reduce motion" setting answers — a scroll is then an instant jump. */
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * The cookie bar `@owlmeans/web-consent` floats over the bottom of a page while a visitor has not
 * answered it — found by its public DOM hook, never imported: this package does not depend on that one.
 */
export const COOKIE_BAR = '[data-consent-bar]'

/** Air kept between the scrolled-to buttons and whatever floats over the bottom of the page. */
export const BAR_AIR = 16
