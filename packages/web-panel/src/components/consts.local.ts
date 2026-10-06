import type { TextVariant } from './types.js'

/**
 * Tailwind default breakpoints — kept stable across consumers. If a consumer
 * has customised Tailwind breakpoints in their app config, override this
 * via a wrapping hook in the app.
 */
export const BREAKPOINTS: Array<{ name: string, min: number, max: number }> = [
  { name: 'xs', min: 0,    max: 639  },
  { name: 'sm', min: 640,  max: 767  },
  { name: 'md', min: 768,  max: 1023 },
  { name: 'lg', min: 1024, max: 1279 },
  { name: 'xl', min: 1280, max: Number.POSITIVE_INFINITY },
]

export const variantClasses: Record<TextVariant, string> = {
  h1: 'scroll-m-20 text-4xl font-extrabold tracking-tight',
  h2: 'scroll-m-20 text-3xl font-semibold tracking-tight',
  h3: 'scroll-m-20 text-2xl font-semibold tracking-tight',
  h4: 'scroll-m-20 text-xl font-semibold tracking-tight',
  p: 'leading-7',
  lead: 'text-xl text-muted-foreground',
  large: 'text-lg font-semibold',
  small: 'text-sm font-medium leading-none',
  muted: 'text-sm text-muted-foreground',
  blockquote: 'mt-6 border-l-2 pl-6 italic',
}

export const DARK_CLASS = 'dark'
