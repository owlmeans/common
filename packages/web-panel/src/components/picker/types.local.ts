import type { ComponentProps, KeyboardEvent, ReactElement, ReactNode, Ref, RefObject } from 'react'
import type { PickerColor, PickerIconCategory, ResolvedPickerColor } from '../../picker/vocabulary/types.js'
import type { PickerTranslate } from './types.js'

/** Where a panel is laid out — it decides cell sizes and paddings. */
export type PickerLayout = 'popover' | 'sheet' | 'inline'

/** Which halves a picker edits. */
export type PickerMode = 'both' | 'icon' | 'color'

/** Every string a picker shows, resolved through one `translate`. */
export interface PickerText {
  /** A chrome string by key, English fallback. */
  text: (key: string, fallback: string) => string
  /** A colour's name: a palette name through `colors.<key>`, a custom colour's hex as is. */
  color: (color: ResolvedPickerColor) => string
  /** An icon's name — the kebab name humanized; icon names are never translated. */
  icon: (name: string) => string
  category: (category: PickerIconCategory) => string
  /** "Icons found: 12" for the live region. */
  count: (count: number) => string
  /** "No icons match …". */
  empty: (query: string) => string
  /** "Rocket · Indigo", or `null` while nothing is chosen. */
  summary: (icon: string | null | undefined, color: ResolvedPickerColor | null, mode: PickerMode) => string | null
}

/** Arrow-key focus across a grid of buttons; only one of them is in the tab order. */
export interface RovingGrid {
  ref: RefObject<HTMLDivElement | null>
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  /** `0` for the one item in the tab order, `-1` for the rest. */
  tabIndexOf: (index: number) => number
  /** Remember an item as the current one (it took focus). */
  setCurrent: (index: number) => void
  /** Focus the current item. */
  focusCurrent: () => void
}

export interface RovingGridOptions {
  count: number
  /** The item that starts in the tab order — the selected one. */
  selected: number
  /** ArrowUp from the first row: hand focus back (the search field above a grid). */
  onExitUp?: () => void
  /** `false` — one row, Left/Right only. */
  grid?: boolean
}

export interface SwatchGridProps {
  value?: string | null
  /** A swatch was pressed. */
  onChange: (color: string) => void
  /** The custom wheel or hex field changed; default `onChange`. A picker that closes on a pick keeps this open. */
  onCustomChange?: (color: string) => void
  colors: readonly PickerColor[]
  customColors: boolean
  text: PickerText
  layout: PickerLayout
  label: string
  className?: string
}

export interface CustomColorProps {
  /** The current value when it is a custom colour, else `null`. */
  value: ResolvedPickerColor | null
  onChange: (color: string) => void
  text: PickerText
}

export interface IconBrowserProps {
  value?: string | null
  onChange: (icon: string) => void
  color?: string | null
  colors: readonly PickerColor[]
  icons?: readonly string[]
  text: PickerText
  layout: PickerLayout
  label: string
  /** The search field — the surface focuses it on open for a fine pointer. */
  searchRef?: Ref<HTMLInputElement>
  className?: string
}

export interface PickerPanelProps {
  mode: PickerMode
  icon?: string | null
  color?: string | null
  onIcon: (icon: string) => void
  /** A swatch was pressed. */
  onColor: (color: string) => void
  /** The custom wheel or hex field changed. */
  onCustomColor: (color: string) => void
  colors: readonly PickerColor[]
  icons?: readonly string[]
  customColors: boolean
  text: PickerText
  layout: 'popover' | 'sheet'
  title: string
  /** The sheet's Done button; the popover has none. */
  onDone?: () => void
  searchRef: Ref<HTMLInputElement>
}

export interface PickerSurfaceProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: 'popover' | 'sheet'
  /** Holds an icon grid — keep one height so filtering never makes the surface jump. */
  tall: boolean
  /** The trigger — the popover's anchor, kept in the same place in the tree for both surfaces. */
  anchor: ReactElement
  title: string
  /** Focus on open (the search field for a fine pointer, the selected cell otherwise). */
  onOpenFocus: (content: HTMLElement) => void
  /** Focus back on the trigger once closed. */
  onCloseFocus: () => void
  children: ReactNode
}

/** The trigger's own props; anything else (the popover anchor's) lands on the button. */
export interface PickerTriggerProps extends Omit<ComponentProps<'button'>, 'color' | 'onClick' | 'type' | 'children'> {
  mode: PickerMode
  variant: 'button' | 'tile' | 'dot'
  icon?: string | null
  color?: string | null
  colors: readonly PickerColor[]
  text: PickerText
  label?: string
  placeholder: string
  open: boolean
  onOpen: () => void
}

export interface PickerRootProps {
  mode: PickerMode
  icon?: string | null
  color?: string | null
  onIcon: (icon: string) => void
  onColor: (color: string) => void
  colors?: readonly PickerColor[]
  icons?: readonly string[]
  customColors?: boolean
  trigger: 'button' | 'tile' | 'dot'
  /** A single-purpose picker closes once something is picked; the composite stays for the other half. */
  closeOnPick: boolean
  label?: string
  placeholder?: string
  disabled?: boolean
  surface?: 'auto' | 'popover' | 'sheet'
  translate?: PickerTranslate
  className?: string
  id?: string
}
