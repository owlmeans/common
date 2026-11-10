/** Color parsing and normalization on culori. Package-private. */
export interface ColorHelper {
  /** `#rrggbb` (or `#rrggbbaa` when translucent) for any CSS color; `undefined` for none or transparent. */
  normalize: (value: string) => string | undefined
  /** Every color named in a declaration value (a shorthand, a gradient), normalized. */
  extract: (value: string) => string[]
  /** WCAG contrast ratio of two colors, 1..21. */
  contrast: (a: string, b: string) => number
}

/** Reads a page's measurable design: parsed CSS weighted by the DOM, rendered samples merged over it. */
export interface DesignFactsHelper {
  read: (page: import('../models/page/types.js').PageModel, sheets: string[], stylesheets: import('./types.js').DesignFacts['stylesheets']) => import('./types.js').DesignFacts
  merge: (facts: import('./types.js').DesignFacts, rendered: import('../render/types.js').RenderedPage) => import('./types.js').DesignFacts
}

/** One parsed CSS rule and the media query it sits under. */
export interface CssRule {
  selectors: string[]
  declarations: [string, string][]
  media?: string
}
