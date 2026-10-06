export const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * A 44px round target in the page's own tokens — muted at rest, the foreground on hover — with
 * the 3px ring every interactive element shows on keyboard focus. No fill, border, gradient or
 * shadow: it sits in a footer's bottom row beside the credit and must read as part of it.
 */
export const TOGGLE = [
  'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full',
  'bg-transparent text-muted-foreground transition-colors hover:text-foreground',
  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2',
  'focus-visible:ring-offset-background',
].join(' ')
