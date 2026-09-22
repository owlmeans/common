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

/** The `localStorage` key the choice lives under. */
export const COLOR_SCHEME_KEY = 'owlmeans:color-scheme'

/**
 * The event `applyColorScheme` dispatches on `window` after every change, so every mounted
 * `useColorScheme` in the document — two toggles, a header and a footer — agrees at once.
 */
export const COLOR_SCHEME_EVENT = 'owlmeans:color-scheme'

/** An explicit choice. Absent (`null`) means "follow the operating system". */
export type ColorSchemeChoice = 'light' | 'dark'

const isChoice = (value: unknown): value is ColorSchemeChoice => value === 'light' || value === 'dark'

/**
 * The stored choice, or `null` when there is none, it is not a choice, or storage is unreachable
 * (a private window, blocked site data, no `window` at all).
 */
export const readColorScheme = (): ColorSchemeChoice | null => {
  try {
    const value = globalThis.localStorage?.getItem(COLOR_SCHEME_KEY)

    return isChoice(value) ? value : null
  } catch {
    return null
  }
}

/** Put exactly the class for `choice` on the document element — none for `null`. Stores nothing. */
export const setColorSchemeClass = (choice: ColorSchemeChoice | null): void => {
  if (typeof document === 'undefined') {
    return
  }
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  if (choice != null) {
    root.classList.add(choice)
  }
}

/**
 * Apply a choice now and remember it: the class on the document element, the stored key (cleared
 * for `null`), and one `COLOR_SCHEME_EVENT` for everything in this document that renders from it.
 * Storage failures are swallowed — the page still switches, it just forgets on the next load.
 */
export const applyColorScheme = (choice: ColorSchemeChoice | null): void => {
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

/**
 * The inline script for the document head, placed before any stylesheet paints.
 *
 * It reads the stored choice and puts its class on the document element before the first paint —
 * the only moment it can: a component that did the same after mounting shows every visitor who
 * chose dark one frame of the light page first. Self-contained on purpose (it inlines the key
 * rather than importing it) and wrapped in `try`, because storage can throw and a head script
 * that throws stops nothing but itself. No stored choice adds no class, and the stylesheet's own
 * `prefers-color-scheme` rule decides.
 */
export const colorSchemeBootstrapScript = (): string =>
  `(function(){try{var c=localStorage.getItem(${JSON.stringify(COLOR_SCHEME_KEY)});`
  + `if(c==='light'||c==='dark'){var r=document.documentElement;`
  + `r.classList.remove('light','dark');r.classList.add(c);}}catch(e){}})();`
