/** An sRGB colour, each channel 0..1. */
export interface Rgb {
  r: number
  g: number
  b: number
}

/** A colour in OKLCH: lightness 0..1, chroma, hue in radians. */
export interface Oklch {
  l: number
  c: number
  h: number
}

/** The four mode-dependent values a custom colour needs, each a lowercase `#rrggbb`. */
export interface DerivedColor {
  ink: string
  soft: string
  inkDark: string
  softDark: string
}

/** Colour arithmetic for custom colours: parsing, WCAG contrast and OKLCH with gamut fitting. */
export interface ColorUtils {
  /** A six-digit `#rrggbb` (any case) → channels; anything else → `null`. */
  parse: (hex: string) => Rgb | null
  /** Channels → lowercase `#rrggbb`, clamped and rounded. */
  hex: (rgb: Rgb) => string
  /** WCAG 2 contrast ratio of two six-digit hex colours, 1..21. */
  contrast: (a: string, b: string) => number
  /**
   * The ink and ground a custom colour renders with in both modes: grounds in the colour's hue,
   * inks moved only as far in lightness as it takes to keep 4.5:1 on the ground and on the page
   * (white, black). A colour that already reads well keeps its own value as the light ink.
   */
  derive: (hex: string) => DerivedColor
}
