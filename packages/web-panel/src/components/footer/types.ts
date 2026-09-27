import type { PropsWithChildren, ReactNode } from 'react'
import type { NavTranslate, PanelNavLink } from '@owlmeans/client-panel'
import type { ThemeToggleLabels } from '../scheme/types.js'
import type { StyledProps } from '../types.js'

/** `true` for the English labels; an object to pass the application's own. */
export type FooterThemeToggle = boolean | { labels?: ThemeToggleLabels }

export interface FooterProps extends PropsWithChildren<StyledProps> {
  links?: PanelNavLink[]
  /**
   * The application's own footer layout — a brand, a one-line description, link columns — as a
   * full-width block (`w-full self-stretch`, start-aligned text) on the container's rhythm, above
   * the link row and the credit line. `children`, by contrast, join the centred link row.
   */
  content?: ReactNode
  /**
   * Render the light/dark `ThemeToggle` in the bottom row, beside the credit line. Absent or
   * `false`, the footer is exactly what it is without a switcher.
   */
  themeToggle?: FooterThemeToggle
  /** The shell's horizontal rhythm, so the footer row lines up with the header and the content. */
  containerClassName?: string
  /** See {@link NavTranslate} — omitted, literal labels and humanized aliases are used. */
  translate?: NavTranslate
}
