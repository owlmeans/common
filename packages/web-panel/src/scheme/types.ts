/** An explicit choice. Absent (`null`) means "follow the operating system". */
export type ColorSchemeChoice = 'light' | 'dark'

/** The visitor's colour-scheme choice: read, applied to the document element, stored, and bootstrapped in the head. */
export interface ColorSchemeHelper {
  /**
   * The stored choice, or `null` when there is none, it is not a choice, or storage is unreachable
   * (a private window, blocked site data, no `window` at all).
   */
  readColorScheme: () => ColorSchemeChoice | null
  /** Put exactly the class for `choice` on the document element — none for `null`. Stores nothing. */
  setColorSchemeClass: (choice: ColorSchemeChoice | null) => void
  /**
   * Apply a choice now and remember it: the class on the document element, the stored key (cleared
   * for `null`), and one `COLOR_SCHEME_EVENT` for everything in this document that renders from it.
   * Storage failures are swallowed — the page still switches, it just forgets on the next load.
   */
  applyColorScheme: (choice: ColorSchemeChoice | null) => void
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
  colorSchemeBootstrapScript: () => string
}
