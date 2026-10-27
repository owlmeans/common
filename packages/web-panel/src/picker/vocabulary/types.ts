import type { PICKER_COLOR_KEYS, PICKER_ICON_CATEGORIES } from './consts.js'

/**
 * One colour a picker offers. The palette's own entries carry hex values; an application's palette
 * may carry any CSS colour — a status palette reads its theme's `var(--tone-<t>)` tokens.
 */
export interface PickerColor {
  /** Palette key (`'blue'`), or any id of an application palette (`'info'`). What is stored. */
  key: string
  /** The swatch circle the picker shows for this colour (hex or `var(...)`). */
  swatch: string
  /** Icon and dot colour on the light page — at least 3:1 on `soft` and on white. */
  ink: string
  /** Tile ground on the light page. */
  soft: string
  /** Icon and dot colour on the dark page — at least 3:1 on `softDark` and on black. Defaults to `ink`. */
  inkDark?: string
  /** Tile ground on the dark page. Defaults to `soft`. */
  softDark?: string
  /** English name; absent, the key humanized. */
  label?: string
}

/** A stored colour value read against a palette: every field filled in. */
export interface ResolvedPickerColor {
  /** The palette key, or the normalized lowercase `#rrggbb` of a custom colour. */
  key: string
  /** `true` for a hex value that is not a palette key. */
  custom: boolean
  /** English name — the palette label, or the hex itself for a custom colour. */
  label: string
  swatch: string
  ink: string
  soft: string
  inkDark: string
  softDark: string
}

/** One of the 24 palette keys. */
export type PickerColorKey = typeof PICKER_COLOR_KEYS[number]

/** One of the icon catalogue's categories. */
export type PickerIconCategory = typeof PICKER_ICON_CATEGORIES[number]

/** One icon of the catalogue: a kebab-case lucide name, its category and English search words. */
export interface PickerIconEntry {
  name: string
  category: PickerIconCategory
  keywords: readonly string[]
}

/** Reads, validates and renders a stored colour value. React-free. */
export interface PickerColorHelper {
  /** `'#abc'` or `'#aabbcc'`, any case — the forms a picker accepts as a custom colour. */
  isHex: (value: unknown) => value is string
  /** `'#ABC'`, `'abc'`, `'AABBCC'` → `'#aabbcc'`; anything else → `null`. */
  normalizeHex: (value: string) => string | null
  /**
   * A key of `colors` (default the 24-colour palette) or a hex value, every field filled in — a hex
   * gets an ink and a ground derived from it that keep 4.5:1 in both modes. Unknown or empty → `null`.
   */
  resolve: (value: string | null | undefined, colors?: readonly PickerColor[]) => ResolvedPickerColor | null
  /**
   * The CSS custom properties `--pick-swatch`, `--pick-ink`, `--pick-soft`, `--pick-ink-dark` and
   * `--pick-soft-dark` for a value — what every picker part reads. Unknown → the fallback colour's
   * (`slate`, or the first entry of an application palette without one). A plain string record, so it
   * goes straight into a React `style` (and merges with other properties there).
   */
  styleOf: (value: string | null | undefined, colors?: readonly PickerColor[]) => Record<string, string>
  /** The same key for the same seed — a stable colour for a record that has none of its own. */
  hashKey: (seed: string, keys?: readonly string[]) => string
}
