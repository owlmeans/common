import type { PropsWithChildren, ReactNode } from 'react'
import type { NavTranslate, PanelNavConfig, PanelNavLink } from '@owlmeans/client-panel'
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

export interface NavLayoutProps extends PropsWithChildren<StyledProps> {
  nav: PanelNavConfig
  translate?: NavTranslate
  /** Brand slot — rendered at the far left of the header. */
  title?: ReactNode
  /** Alias the brand navigates to. Defaults to the first section's first item. */
  home?: string
  /** Header right side — sign-in controls, a theme toggle, whatever the app puts there. */
  actions?: ReactNode
  /** Links array renders the standard footer; a node replaces it entirely. */
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
