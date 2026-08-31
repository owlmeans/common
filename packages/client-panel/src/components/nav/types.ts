import type { ComponentType } from 'react'

/**
 * One screen in the navigation — the second menu level.
 *
 * `alias` addresses a frontend entrypoint, so an item never carries a URL: the router
 * resolves it, and a path that changes shape stays correct everywhere it is rendered.
 */
export interface PanelNavItem {
  alias: string
  /** Literal label. Absent, the label is resolved through `translate` and falls back to a humanized alias. */
  label?: string
  Icon?: ComponentType<{ className?: string }>
  hidden?: boolean
}

/**
 * One section — the first menu level. Its items are the screens the side menu offers
 * while the section is active.
 */
export interface PanelNavSection {
  /** Stable key. Also the default translation key (`nav.<name>`). */
  name: string
  label?: string
  /** Ordered. The first visible item is where pressing the section navigates. */
  items: PanelNavItem[]
  hidden?: boolean
}

export interface PanelNavConfig {
  sections: PanelNavSection[]
}

/** A footer link: exactly one of `alias` (an entrypoint) or `href` (anything else). */
export interface PanelNavLink {
  alias?: string
  href?: string
  label?: string
  /** Open in a new tab. */
  open?: boolean
}

/**
 * Resolves a label from a translation key.
 *
 * It is a PROP, never an implicit context read: an app that mounts without an i18n provider
 * (`renderApp` from `@owlmeans/web-client` does) must still render a menu, and reaching for
 * the panel i18n context there throws inside the render tree and blanks the whole app.
 * The default returns the fallback, so literal labels work with no i18n at all.
 */
export interface NavTranslate {
  (key: string, defaultValue: string): string
}

export interface PanelNavModel {
  /** Sections and items with `hidden` filtered out. */
  sections: PanelNavSection[]
  /** Alias of the screen currently rendered, when it could be resolved. */
  current: string | null
  active: PanelNavSection | null
  /**
   * Whether the side menu carries anything worth showing — false when the active section
   * holds a single screen, which is the whole point: one screen needs no second level.
   */
  showSide: boolean
  isSectionActive: (section: PanelNavSection) => boolean
  isItemActive: (item: PanelNavItem) => boolean
  goSection: (section: PanelNavSection) => () => void
  goItem: (item: PanelNavItem) => () => void
  /**
   * The resolved URL of a section's landing screen, when it has one.
   *
   * A menu entry navigates through `nav.press`, but it still has to BE a link: an `<a>`
   * without `href` is not focusable, does not answer the keyboard, and cannot be opened in a
   * new tab. Undefined for a path carrying route parameters — there is no honest URL to show
   * for a screen whose address is not known yet.
   */
  hrefOf: (target: PanelNavItem | PanelNavSection) => string | undefined
}
