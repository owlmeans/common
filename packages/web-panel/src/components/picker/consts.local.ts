import type { CSSProperties } from 'react'
import type { PickerDotSize, PickerTileSize } from './types.js'
import type { PickerLayout } from './types.local.js'

/** From this width up `surface="auto"` opens a popover; below it, a bottom sheet. */
export const POPOVER_QUERY = '(min-width: 768px)'

/** A mouse or trackpad — the search field may take focus on open without raising a keyboard. */
export const FINE_POINTER_QUERY = '(pointer: fine)'

/**
 * The current mode's ink and ground, read from the five custom properties `styleOf` sets.
 *
 * Dark follows web-panel's colour-scheme contract — `.dark` on the document element, or the
 * operating system's dark unless `.light` is there — through explicit arbitrary variants. Never the
 * consumer's `dark:`: an application may define it any way it likes, or not at all. Every part that
 * carries a colour's style puts this on the same element; children read `--pick-fg` / `--pick-bg`.
 */
export const PICK_SCOPE = [
  '[--pick-fg:var(--pick-ink)] [--pick-bg:var(--pick-soft)]',
  '[.dark_&]:[--pick-fg:var(--pick-ink-dark)] [.dark_&]:[--pick-bg:var(--pick-soft-dark)]',
  '[@media(prefers-color-scheme:dark)]:[:root:not(.light)_&]:[--pick-fg:var(--pick-ink-dark)]',
  '[@media(prefers-color-scheme:dark)]:[:root:not(.light)_&]:[--pick-bg:var(--pick-soft-dark)]',
].join(' ')

/** A hairline inside a swatch, so a dark swatch keeps an edge on a dark surface and a pale one on a light. */
export const HAIRLINE = [
  'shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)]',
  '[.dark_&]:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.24)]',
  '[@media(prefers-color-scheme:dark)]:[:root:not(.light)_&]:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.24)]',
].join(' ')

export const TILE = 'inline-flex shrink-0 items-center justify-center bg-(--pick-bg) text-(--pick-fg)'

export const TILE_SIZE: Record<PickerTileSize, string> = {
  xs: 'size-5 rounded-[5px] [&>svg]:size-3',
  sm: 'size-7 rounded-md [&>svg]:size-4',
  md: 'size-9 rounded-lg [&>svg]:size-5',
  lg: 'size-12 rounded-xl [&>svg]:size-6',
}

export const PLAIN = 'inline-flex shrink-0 items-center justify-center text-(--pick-fg)'

export const PLAIN_SIZE: Record<PickerTileSize, string> = {
  xs: '[&>svg]:size-3',
  sm: '[&>svg]:size-4',
  md: '[&>svg]:size-5',
  lg: '[&>svg]:size-6',
}

export const DOT = 'inline-block shrink-0 rounded-full bg-(--pick-fg)'

export const DOT_SIZE: Record<PickerDotSize, string> = {
  xs: 'size-2',
  sm: 'size-2.5',
  md: 'size-3.5',
}

/**
 * Focus on a cell is an outline, so it never fights the ring that marks the selected one. Tailwind
 * v4's `outline-none` would pin the style to `none` under the focus width — `outline-hidden` plus an
 * explicit `outline-solid` is what shows it.
 */
const CELL_FOCUS = [
  'outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1',
  'focus-visible:outline-ring',
].join(' ')

/** Below 768px and on a coarse pointer every control is at least 44px. */
const TOUCH_HEIGHT = 'max-md:h-11 pointer-coarse:h-11'

export const TRIGGER_BUTTON = [
  'group/picker inline-flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-input',
  'bg-transparent py-1 pr-2.5 pl-1 text-left text-sm shadow-xs outline-none',
  'transition-[color,box-shadow,background-color] hover:bg-accent/60 motion-reduce:transition-none',
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
  'aria-expanded:border-ring aria-expanded:ring-[3px] aria-expanded:ring-ring/30',
  'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
  'max-md:h-11 max-md:pl-2 pointer-coarse:h-11 pointer-coarse:pl-2',
].join(' ')

export const TRIGGER_COMPACT = [
  'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg outline-none',
  'transition-shadow motion-reduce:transition-none',
  'focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-expanded:ring-[3px] aria-expanded:ring-ring/30',
  'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
  'max-md:size-11 pointer-coarse:size-11',
].join(' ')

export const TRIGGER_DOT = 'rounded-full border border-input bg-transparent hover:bg-accent/60'

/** The empty tile of a trigger while nothing is chosen. */
export const TRIGGER_EMPTY = [
  'inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-dashed',
  'border-muted-foreground/40 text-muted-foreground [&>svg]:size-4',
].join(' ')

export const CHEVRON = [
  'ml-auto size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
  'group-aria-expanded/picker:rotate-180',
].join(' ')

export const POPOVER = [
  'flex w-[23rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-border p-0 shadow-lg',
  'bg-popover text-popover-foreground',
  'max-h-[min(34rem,var(--radix-popover-content-available-height))]',
  // `!`: the primitive's `data-[state=open]:animate-in` outranks a plain variant class.
  'pointer-coarse:w-[26rem] motion-reduce:animate-none! motion-reduce:transition-none!',
].join(' ')

export const SHEET = [
  'mx-auto max-h-[88dvh] w-full gap-0 overflow-hidden rounded-t-2xl border-t border-border p-0',
  'bg-popover text-popover-foreground pb-[env(safe-area-inset-bottom)]',
  'sm:max-w-xl sm:border-x motion-reduce:animate-none! motion-reduce:transition-none!',
].join(' ')

/** With an icon grid the surface keeps one height, so filtering never makes it jump. */
export const TALL: Record<'popover' | 'sheet', string> = {
  popover: 'h-[min(34rem,var(--radix-popover-content-available-height))]',
  sheet: 'h-[88dvh]',
}

/** The trigger's swatch disc for a colour-only picker — the colour as it was picked. */
export const TRIGGER_DISC = 'block size-4 shrink-0 rounded-full bg-(--pick-swatch)'

export const GRAB = 'mx-auto mt-2 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30'

export const HEADER: Record<'popover' | 'sheet', string> = {
  popover: 'flex shrink-0 items-center gap-3 border-b border-border px-3 py-2.5',
  sheet: 'flex shrink-0 items-center gap-3 border-b border-border px-4 pt-1 pb-3',
}

export const HEADER_TITLE = 'truncate text-sm font-semibold leading-5'
export const HEADER_SUMMARY = 'truncate text-xs leading-4 text-muted-foreground'

export const DONE = [
  'inline-flex h-11 min-w-16 shrink-0 cursor-pointer items-center justify-center rounded-lg px-4',
  'bg-primary text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90',
  'focus-visible:ring-[3px] focus-visible:ring-ring/50',
].join(' ')

export const BODY = 'min-h-0 flex-1 overflow-y-auto overscroll-contain'

export const SECTION: Record<'popover' | 'sheet', string> = {
  popover: 'px-3 pt-3',
  sheet: 'px-4 pt-4',
}

export const SECTION_TITLE = 'mb-2 text-xs font-medium text-muted-foreground'

export const SWATCHES: Record<PickerLayout, string> = {
  popover: [
    'grid grid-cols-12 gap-1',
    'max-md:grid-cols-[repeat(auto-fill,minmax(44px,1fr))] pointer-coarse:grid-cols-[repeat(auto-fill,minmax(44px,1fr))]',
  ].join(' '),
  sheet: 'grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5',
  inline: [
    'grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5',
    'md:pointer-fine:grid-cols-[repeat(12,minmax(0,2rem))] md:pointer-fine:gap-1',
  ].join(' '),
}

export const SWATCH = [
  'group/swatch inline-flex aspect-square w-full min-w-0 cursor-pointer items-center justify-center rounded-full',
  CELL_FOCUS,
].join(' ')

export const SWATCH_DISC = [
  'pointer-events-none block size-[76%] max-h-9 max-w-9 rounded-full bg-(--pick-swatch)',
  'transition-transform group-hover/swatch:scale-110 motion-reduce:transition-none motion-reduce:group-hover/swatch:scale-100',
  HAIRLINE,
].join(' ')

export const SWATCH_SELECTED = 'ring-2 ring-foreground ring-offset-2 ring-offset-popover'

export const CUSTOM_ROW = [
  'mt-2 flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-1.5 text-left text-sm',
  'hover:bg-accent hover:text-accent-foreground',
  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
  TOUCH_HEIGHT,
].join(' ')

export const CUSTOM_DISC = 'block size-5 shrink-0 rounded-full'

/** The colour wheel's mark while no custom colour is chosen. */
export const RAINBOW = 'bg-[conic-gradient(from_180deg,#ef4444,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)]'

export const CUSTOM_PANEL = 'mt-2 flex flex-col gap-2'

/** A full six-digit value — committed while typing; a three-digit one waits for Enter or blur. */
export const FULL_HEX = /^#?[0-9a-f]{6}$/i

/** The wheel's colour while nothing custom is chosen yet — also the hex field's placeholder. */
export const CUSTOM_START = '#3b82f6'

/** react-colorful sizes itself with a stylesheet it injects; an inline size is the one that always wins. */
export const WHEEL_STYLE: CSSProperties = { width: '100%', height: 148 }

export const FIELD = [
  'h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none',
  'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
  'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
  TOUCH_HEIGHT,
].join(' ')

export const HEX_FIELD = 'font-mono'

export const FIELD_ERROR = 'text-xs text-destructive'

/** The search field and the chips stay in view while the grid scrolls under them. */
export const ICON_TOOLS: Record<PickerLayout, string> = {
  popover: 'sticky top-0 z-10 -mx-3 bg-popover px-3 pb-2',
  sheet: 'sticky top-0 z-10 -mx-4 bg-popover px-4 pb-2',
  inline: 'pb-2',
}

export const SEARCH_WRAP = 'relative'
export const SEARCH_ICON = 'pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
export const SEARCH = 'pl-8 [&::-webkit-search-cancel-button]:cursor-pointer'

/** One scrolling row of category chips, running to the surface's edges rather than its padding. */
export const CHIPS: Record<PickerLayout, string> = {
  popover: 'mt-2 -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 scroll-px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  sheet: 'mt-2 -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 scroll-px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  inline: 'mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
}

export const CHIP = [
  'inline-flex h-7 shrink-0 cursor-pointer items-center rounded-full border border-input px-2.5',
  'text-xs font-medium text-muted-foreground transition-colors motion-reduce:transition-none',
  'hover:bg-accent hover:text-accent-foreground',
  'aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground',
  CELL_FOCUS,
  'max-md:h-11 max-md:px-4 max-md:text-sm pointer-coarse:h-11 pointer-coarse:px-4 pointer-coarse:text-sm',
].join(' ')

export const ICONS: Record<PickerLayout, string> = {
  popover: [
    'grid grid-cols-9 gap-0.5',
    'max-md:grid-cols-[repeat(auto-fill,minmax(44px,1fr))] pointer-coarse:grid-cols-[repeat(auto-fill,minmax(44px,1fr))]',
  ].join(' '),
  sheet: 'grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1',
  inline: [
    'grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1',
    'md:pointer-fine:grid-cols-[repeat(auto-fill,minmax(36px,1fr))] md:pointer-fine:gap-0.5',
  ].join(' '),
}

export const ICON_CELL = [
  'inline-flex aspect-square w-full min-w-0 cursor-pointer items-center justify-center rounded-md text-(--pick-fg)',
  'transition-colors hover:bg-accent motion-reduce:transition-none [&>svg]:size-5',
  'aria-pressed:bg-(--pick-bg) aria-pressed:ring-2 aria-pressed:ring-(--pick-fg) aria-pressed:ring-inset',
  CELL_FOCUS,
].join(' ')

export const ICON_GRID_PAD: Record<PickerLayout, string> = {
  popover: 'pb-3',
  sheet: 'pb-4',
  inline: '',
}

export const EMPTY = 'flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground'

export const LINK_BUTTON = [
  'cursor-pointer rounded-sm text-sm font-medium text-foreground underline underline-offset-4',
  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
].join(' ')
