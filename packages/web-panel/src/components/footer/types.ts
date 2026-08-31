import type { PropsWithChildren } from 'react'
import type { NavTranslate, PanelNavLink } from '@owlmeans/client-panel'
import type { StyledProps } from '../types.js'

export interface FooterProps extends PropsWithChildren<StyledProps> {
  links?: PanelNavLink[]
  /** The shell's horizontal rhythm, so the footer row lines up with the header and the content. */
  containerClassName?: string
  /** See {@link NavTranslate} — omitted, literal labels and humanized aliases are used. */
  translate?: NavTranslate
}
