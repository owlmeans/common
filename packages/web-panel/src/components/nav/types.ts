import type { PropsWithChildren, ReactNode } from 'react'
import type { NavTranslate, PanelNavConfig, PanelNavLink } from '@owlmeans/client-panel'
import type { FooterThemeToggle } from '../footer/types.js'
import type { StyledProps } from '../types.js'

interface NavCommonProps extends StyledProps {
  config: PanelNavConfig
  /** See {@link NavTranslate} — omitted, literal labels and humanized aliases are used. */
  translate?: NavTranslate
  ariaLabel?: string
}

export interface TopNavProps extends NavCommonProps { }

export interface SideNavProps extends NavCommonProps {
  /**
   * `side` is the column beside the content; `bar` is the horizontal strip the narrow
   * viewport gets instead. Both render the same items — only one is visible at a time.
   */
  variant?: 'side' | 'bar'
}

/**
 * `ariaLabel` names the navigation landmark INSIDE the sheet; `translate` also resolves the menu
 * button's accessible name and the sheet's title (`shell.menu`, default "Menu") and its close
 * button's (`shell.close`, default "Close"). `className` and `style` land on the trigger button.
 */
export interface MobileNavProps extends NavCommonProps { }

export interface NavLayoutProps extends PropsWithChildren<StyledProps> {
  nav: PanelNavConfig
  translate?: NavTranslate
  /** Brand slot — rendered at the far left of the header. */
  title?: ReactNode
  /** Alias the brand navigates to. Defaults to the first section's first item. */
  home?: string
  /** Header right side — sign-in controls, a theme toggle, whatever the app puts there. */
  actions?: ReactNode
  /**
   * Opt-in narrow-viewport menu. Below `md` (768px) the section menu is hidden and a menu button
   * at the end of the header opens a sheet listing every section and its screens ({@link
   * MobileNavProps}); `actions` stay in the header at every width. The screen strip the narrow
   * viewport otherwise gets under the header is NOT rendered then — the sheet already lists the
   * same screens, and two menus for one level is one too many. Off, the shell is exactly what it
   * has always been.
   */
  mobileMenu?: boolean
  /**
   * The skip link rendered first in the page, ahead of the header, moving focus to the content
   * (`<main id="main">`). Invisible until focused, then a pill in the top-left corner. Defaults to
   * `translate('shell.skip', 'Skip to content')`; `false` renders no link AND leaves `main`
   * without the `main` id, for an application that renders its own skip link and target.
   */
  skipLinkLabel?: string | false
  /**
   * The light/dark switcher in the footer's bottom row, beside the credit — forwarded to
   * `Footer`, whether `footer` is links, a node or absent. The accessible names resolve
   * `shell.toLight` / `shell.toDark` through `translate` unless `labels` gives them. Absent or
   * `false`, the footer renders exactly as it does without one.
   */
  themeToggle?: FooterThemeToggle
  /**
   * An array renders the standard footer: a centred row of links above the credit line.
   *
   * A node is the application's OWN footer layout — brand, description, link columns — and is
   * rendered as a full-width block (`w-full self-stretch`, start-aligned text) inside the footer's
   * container, on the shell's rhythm, above the platform/owner credit line. It never replaces the
   * credit: `ShellCredit` stays last in every footer, and nothing a caller passes here removes it.
   */
  footer?: PanelNavLink[] | ReactNode
  /**
   * Styles the HEADER — the sticky bar carrying the brand, the section menu and `actions`.
   *
   * The header is its own SURFACE: it paints an opaque background because content scrolls
   * under it. Give it a background here and you must give it the paired foreground too
   * (`bg-secondary text-secondary-foreground`), exactly as on any other surface — this is the
   * supported way to give an application a dark top bar, and it is why colouring the root
   * instead is not.
   */
  headerClassName?: string
  /** Styles the content area. NOT its width — see `containerClassName`. */
  contentClassName?: string
  /**
   * The page's horizontal rhythm — width and side padding — applied identically to the header
   * row, the content and the footer row. Give the content a width of its own and it sits inset
   * from a full-width header, which reads as a bug rather than as a layout.
   *
   * MERGED over the shell's default (`mx-auto w-full max-w-6xl px-4`), not substituted for it:
   * pass `max-w-[1280px]` and only the width changes, while the centring and the side padding
   * stay. Name the utility you actually want to move — `px-8` widens the gutters — because
   * anything you do not name keeps its default.
   */
  containerClassName?: string
}
