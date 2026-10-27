import type { CSSProperties } from 'react'
import type { PickerColor } from '../../picker/vocabulary/types.js'

/**
 * Resolves a picker string: the key (`done`, `colors.indigo`, `categories.work` …) and the English
 * text to show without a translation. `usePickerTranslate()` gives one reading the packaged
 * eight-language bundle; without one the parts render English.
 */
export interface PickerTranslate { (key: string, fallback: string): string }

/** Where a picker opens: `auto` — a popover from 768px up, a bottom sheet below (decided when it opens). */
export type PickerSurfaceChoice = 'auto' | 'popover' | 'sheet'

/** What the three pickers share. */
export interface PickerBaseProps {
  /** The trigger's accessible name and the surface's title. */
  label?: string
  /** The trigger's text while nothing is chosen. */
  placeholder?: string
  disabled?: boolean
  surface?: PickerSurfaceChoice
  /** Strings; English without it. Never an implicit i18n read — the parts render without a provider. */
  translate?: PickerTranslate
  /** Merged over the trigger's classes. */
  className?: string
  /** Lands on the trigger button, so a `<label htmlFor>` names it. */
  id?: string
}

/** A stored mark: a palette key or `#rrggbb`, and a kebab-case lucide name. Either may be missing. */
export interface IconColorValue {
  icon?: string | null
  color?: string | null
}

/** What `IconColorPicker` emits: both halves as they now stand; an unset half stays `undefined`, never `null`. */
export interface IconColorChange {
  icon?: string
  color?: string
}

export interface IconColorPickerProps extends PickerBaseProps {
  value?: IconColorValue | null
  onChange: (next: IconColorChange) => void
  /** The palette offered; default the 24 colours. */
  colors?: readonly PickerColor[]
  /** Narrows the icon catalogue (and orders it). */
  icons?: readonly string[]
  /** Adds the full colour wheel and a hex field; the value is then a palette key or `#rrggbb`. */
  customColors?: boolean
  /** `button` (default) — tile, names and a chevron; `tile` — the tile alone. */
  trigger?: 'button' | 'tile'
}

export interface IconPickerProps extends PickerBaseProps {
  value?: string | null
  onChange: (icon: string) => void
  /** The colour the icons are tinted in. */
  color?: string | null
  colors?: readonly PickerColor[]
  icons?: readonly string[]
  trigger?: 'button' | 'tile'
}

export interface ColorPickerProps extends PickerBaseProps {
  value?: string | null
  onChange: (color: string) => void
  colors?: readonly PickerColor[]
  customColors?: boolean
  /** `button` (default) — dot, name and a chevron; `dot` — the dot alone. */
  trigger?: 'button' | 'dot'
}

/** The swatch grid on its own, for a dialog or sheet the application already owns. */
export interface ColorSwatchesProps {
  value?: string | null
  onChange: (color: string) => void
  colors?: readonly PickerColor[]
  customColors?: boolean
  translate?: PickerTranslate
  /** The group's accessible name; default "Colour". */
  label?: string
  className?: string
}

/** The searchable icon grid on its own, for a dialog or sheet the application already owns. */
export interface IconGridProps {
  value?: string | null
  onChange: (icon: string) => void
  /** The colour the icons are tinted in. */
  color?: string | null
  colors?: readonly PickerColor[]
  icons?: readonly string[]
  translate?: PickerTranslate
  /** The grid's accessible name; default "Icon". */
  label?: string
  className?: string
}

export type PickerTileSize = 'xs' | 'sm' | 'md' | 'lg'

/** A stored mark rendered: the icon in the colour's ink on its ground (`tile`), or the ink alone (`plain`). */
export interface IconTileProps {
  icon?: string | null
  color?: string | null
  colors?: readonly PickerColor[]
  size?: PickerTileSize
  variant?: 'tile' | 'plain'
  /** Present — an image with this name; absent — decorative (`aria-hidden`). */
  label?: string
  className?: string
  style?: CSSProperties
}

export type PickerDotSize = 'xs' | 'sm' | 'md'

/** A stored colour rendered as a dot in its ink. */
export interface ColorDotProps {
  color?: string | null
  colors?: readonly PickerColor[]
  size?: PickerDotSize
  /** Present — an image with this name; absent — decorative (`aria-hidden`). */
  label?: string
  className?: string
}
