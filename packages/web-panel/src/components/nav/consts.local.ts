/**
 * The horizontal rhythm of the whole page, applied identically to the header row, the content
 * and the footer row.
 *
 * It lives in ONE constant because the three regions have to agree: a content area with its own
 * width sits visibly inset from a full-width header, which reads as a mistake rather than as a
 * design. Adjust it through `containerClassName`, which is MERGED over this — never by giving
 * the content a width of its own.
 */
export const CONTAINER = 'mx-auto w-full max-w-6xl px-4'

/**
 * A 44px target and a ring that is actually visible: the shadcn button draws its focus ring at
 * half the ring colour's alpha, which on a white header is close to nothing, and a menu button is
 * the one control a keyboard user on a narrow window has to find before anything else.
 */
export const TARGET = 'size-11 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export const ENTRY_ACTIVE = 'bg-accent text-accent-foreground'

/**
 * Section entries are LINKS, not buttons.
 *
 * The shadcn primitive styles its links as menu tiles — a filled hover/active background, a
 * radius and tile padding — which reads as a row of buttons across the top of an application.
 * These classes land after the primitive's, so `cn`'s tailwind-merge drops the conflicting
 * ones; every neutralised utility here has a counterpart in the primitive, and removing one
 * brings the tile back.
 */
export const SECTION_LINK = [
  'bg-transparent hover:bg-transparent focus:bg-transparent',
  'rounded-none px-0 py-1',
  'text-sm font-medium text-muted-foreground',
  'hover:text-foreground hover:underline underline-offset-4',
  // Radix marks the active link with a VALUELESS `data-active`, so the state has to be matched
  // on the attribute's presence. `data-[active=true]` — which the shadcn primitive itself uses —
  // matches nothing here, which is why its own active styling never showed either.
  'data-[active]:text-foreground data-[active]:underline data-[active]:bg-transparent',
  'cursor-pointer',
].join(' ')

/**
 * Invisible until it takes focus, then a pill in the top-left corner above everything — the
 * inverse of the page's own surface (`bg-foreground text-background`), so it reads on any theme.
 *
 * The padding is focus-only: `sr-only` zeroes padding, but a plain `px-4` sorts after it and wins,
 * which leaves a 32px box behind the clip instead of the 1px one assistive tech expects.
 */
export const SKIP_LINK = [
  'sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-3',
  'rounded-full bg-foreground text-sm font-semibold text-background',
  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2',
  'focus-visible:ring-offset-background',
].join(' ')

/**
 * Sheet entries are LINKS, exactly as the section menu's are — a real `href` keeps each one
 * focusable, openable in a new tab and announced as a link — and each row is a 44px touch target.
 */
export const ENTRY = [
  'flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground',
  'hover:bg-accent hover:text-accent-foreground',
  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
].join(' ')
