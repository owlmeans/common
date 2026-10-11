import type { FC } from 'react'
import { Moon, Sun } from 'lucide-react'
import { cn } from '../../@/lib/utils.js'
import { useColorScheme } from './hook.js'
import type { ThemeToggleProps } from './types.js'
import { TOGGLE } from './consts.local.js'

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
