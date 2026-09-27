import type { FC } from 'react'
import { Moon, Sun } from 'lucide-react'
import { cn } from '../../@/lib/utils.js'
import { useColorScheme } from './hook.js'
import type { ThemeToggleProps } from './types.js'

/**
 * A 44px round target in the page's own tokens — muted at rest, the foreground on hover — with
 * the 3px ring every interactive element shows on keyboard focus. No fill, border, gradient or
 * shadow: it sits in a footer's bottom row beside the credit and must read as part of it.
 */
const TOGGLE = [
  'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full',
  'bg-transparent text-muted-foreground transition-colors hover:text-foreground',
  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2',
  'focus-visible:ring-offset-background',
].join(' ')

/**
 * The light/dark switcher.
 *
 * It flips the RESOLVED scheme, not the stored choice: on a system that prefers dark and with no
 * choice stored, the page is dark, so the first press means "light" — a toggle keyed on the
 * choice alone would answer that press with "dark", which changes nothing the visitor can see.
 * The icon is the scheme the page is in (a sun while light, a moon while dark), chosen in script
 * from the same state rather than by a `dark:` variant, so it is right whatever the app's CSS
 * calls dark. The accessible name says what pressing does, from `labels` or the English default.
 */
export const ThemeToggle: FC<ThemeToggleProps> = ({ labels, className, style }) => {
  const { scheme, setChoice } = useColorScheme()
  const dark = scheme === 'dark'
  const label = dark
    ? labels?.toLight ?? 'Switch to light mode'
    : labels?.toDark ?? 'Switch to dark mode'

  return <button
    type="button" data-theme-toggle data-scheme={scheme} aria-label={label} title={label}
    onClick={() => setChoice(dark ? 'light' : 'dark')}
    className={cn(TOGGLE, className)} style={style}
  >
    {dark ? <Moon className="size-5" aria-hidden="true" /> : <Sun className="size-5" aria-hidden="true" />}
  </button>
}
