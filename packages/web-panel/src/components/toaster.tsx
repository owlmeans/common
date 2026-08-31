import type { CSSProperties, FC } from 'react'
import { useEffect, useState } from 'react'
import { Toaster as Sonner } from 'sonner'
import type { ToasterProps } from 'sonner'
import { cn } from '@/lib/utils'

const DARK_CLASS = 'dark'

/**
 * Follow whatever puts `.dark` on the document element.
 *
 * The panel's Tailwind theme switches on that class (`@custom-variant dark (&:is(.dark *))`),
 * and every OwlMeans app drives it from something different — `next-themes` with
 * `attribute="class"`, the owl theme provider, or nothing at all. Reading the class rather than a
 * provider's hook means this component follows all three and depends on none of them: a package
 * that imported `next-themes` would force it on every consumer of `@owlmeans/web-panel`, and a
 * second copy of a theme provider is its own class of bug.
 *
 * `'system'` is the answer before the first paint and whenever nothing sets the class — sonner
 * resolves it from `prefers-color-scheme`, which is what an app with no toggle means by it.
 */
const useDocumentTheme = (): ToasterProps['theme'] => {
  const [theme, setTheme] = useState<ToasterProps['theme']>('system')

  useEffect(() => {
    const root = document.documentElement
    const read = () => setTheme(root.classList.contains(DARK_CLASS) ? 'dark' : 'system')
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])

  return theme
}

/**
 * The application's toast surface — mount it ONCE, in the layout.
 *
 * `toast()` from `sonner` is a module-global store, so a second mounted `Toaster` renders every
 * message twice and no mounted `Toaster` renders none of them at all with nothing reported. The
 * layout is therefore the only place this belongs.
 *
 * Colours come from the app's own theme tokens rather than sonner's palette: the CSS variables
 * below are what its stylesheet paints with, so a toast follows `--popover` the way every other
 * floating surface in the app does. A caller's `style` is merged OVER them, so an app that has to
 * shift or recolour the stack keeps the rest.
 */
export const Toaster: FC<ToasterProps> = ({ style, theme, className, ...props }) => {
  const detected = useDocumentTheme()

  return <Sonner
    theme={theme ?? detected}
    className={cn('toaster group', className)}
    richColors
    closeButton
    duration={5000}
    position="top-right"
    style={{
      '--normal-bg': 'var(--popover)',
      '--normal-text': 'var(--popover-foreground)',
      '--normal-border': 'var(--border)',
      ...(style ?? {})
    } as CSSProperties}
    {...props}
  />
}
