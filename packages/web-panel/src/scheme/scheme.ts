/**
 * The colour-scheme choice, with no React and no framework code: a build script running in Node
 * imports this module to inline the head bootstrap, and it must not drag a component tree in.
 *
 * The contract is TWO classes on the document element. `dark` means the visitor chose dark,
 * `light` that they chose light, and neither that they chose nothing — the page follows the
 * operating system. `light` has to exist as a class of its own: without it, a visitor who picks
 * light on a system that prefers dark has no way to say so to a stylesheet that paints dark under
 * `prefers-color-scheme: dark`.
 */

import { COLOR_SCHEME_EVENT, COLOR_SCHEME_KEY } from './consts.js'
import type { ColorSchemeChoice, ColorSchemeHelper } from './types.js'

export const createColorSchemeHelper = (): ColorSchemeHelper => {
  const isChoice = (value: unknown): value is ColorSchemeChoice => value === 'light' || value === 'dark'

  const readColorScheme = (): ColorSchemeChoice | null => {
    try {
      const value = globalThis.localStorage?.getItem(COLOR_SCHEME_KEY)

      return isChoice(value) ? value : null
    } catch {
      return null
    }
  }

  const setColorSchemeClass = (choice: ColorSchemeChoice | null): void => {
    if (typeof document === 'undefined') {
      return
    }
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    if (choice != null) {
      root.classList.add(choice)
    }
  }

  const applyColorScheme = (choice: ColorSchemeChoice | null): void => {
    setColorSchemeClass(choice)
    try {
      if (choice == null) {
        globalThis.localStorage?.removeItem(COLOR_SCHEME_KEY)
      } else {
        globalThis.localStorage?.setItem(COLOR_SCHEME_KEY, choice)
      }
    } catch {
      // Storage is unavailable; the class above is still correct for this page view.
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(COLOR_SCHEME_EVENT))
    }
  }

  const colorSchemeBootstrapScript = (): string =>
    `(function(){try{var c=localStorage.getItem(${JSON.stringify(COLOR_SCHEME_KEY)});`
    + `if(c==='light'||c==='dark'){var r=document.documentElement;`
    + `r.classList.remove('light','dark');r.classList.add(c);}}catch(e){}})();`

  return { readColorScheme, setColorSchemeClass, applyColorScheme, colorSchemeBootstrapScript }
}

export const colorSchemeHelper = createColorSchemeHelper()

/** @deprecated compat:factory-refactor — use `colorSchemeHelper.colorSchemeBootstrapScript()` */
export const colorSchemeBootstrapScript = (): string => colorSchemeHelper.colorSchemeBootstrapScript()
