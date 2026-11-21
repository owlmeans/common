import type { ComponentType } from 'react'

/**
 * One screen in the navigation — the second menu level.
 *
 * `alias` addresses a frontend entrypoint, so an item never carries a URL: the router
 * resolves it, and a path that changes shape stays correct everywhere it is rendered.
 */
export interface PanelNavItem {
  /** Optional stable selector supplied by the host. */
  testId?: string
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
  /** Optional stable selector supplied by the host. */
  testId?: string
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
   * for a screen whose address is not known yet — and for a screen of another application
   * (another frontend service): the click resolves its absolute address through `nav.press`.
   * The application's base is part of the URL (`/admin/users` for an application served under
   * `/admin`); at the root it is the screen's path as declared.
   */
  hrefOf: (target: PanelNavItem | PanelNavSection) => string | undefined
}

/**
 * Where a navigation entry's screen lives, bound to the application's context
 * (`makePanelNavPathHelper(ctx)`; `usePanelNav` holds one per context).
 */
export interface PanelNavPathHelper {
  /**
   * The screen's path in router space — base-less, without a trailing separator — or `null` when
   * the alias addresses nothing this application bound. What the current screen is matched
   * against (`location.pathname` is base-less too).
   */
  pathOf: (alias: string) => string | null
  /**
   * The address a menu entry renders as its `href`: the path with the application's base joined
   * in. Undefined for a path with route parameters, an unbound alias, and a screen of another
   * frontend service — that one is not under this application's base, and the menu reaches its
   * absolute address on click.
   */
  hrefOf: (alias: string) => string | undefined
}

/** How a navigation entry gets its label. */
export interface NavLabelHelper {
  /** Default resolver: no i18n, the caller's fallback wins. See {@link NavTranslate}. */
  defaultNavTranslate: NavTranslate
  /**
   * Turn an alias into something readable — `my-app:web:user-list` becomes `User list`.
   * The last segment is the meaningful one; the prefixes address the app, not the screen.
   */
  defaultNavLabel: (alias: string) => string
  /** The literal label when given, else the translation of `key` falling back to the humanized alias. */
  resolveNavLabel: (translate: NavTranslate, label: string | undefined, key: string, alias?: string) => string
}
