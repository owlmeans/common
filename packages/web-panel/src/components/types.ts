import type { I18nProps } from '@owlmeans/client-i18n'
import type { BlockScaling } from '@owlmeans/client-panel'
import type { CSSProperties, FC, PropsWithChildren } from 'react'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'

/**
 * Shadcn `Typography`-equivalent text variants. Each value maps to a Tailwind
 * class composition inside `Text` / `Link`. This replaces MUI's
 * `TypographyOwnProps['variant']`.
 */
export type TextVariant =
  | 'h1' | 'h2' | 'h3' | 'h4'
  | 'p' | 'lead' | 'large' | 'small' | 'muted' | 'blockquote'

export interface StyledProps {
  /** Tailwind utility classes appended after the component's base classes. */
  className?: string
  /** Raw inline CSS — escape hatch for non-class styling. */
  style?: CSSProperties
}

export interface BlockProps extends PropsWithChildren<I18nProps>, StyledProps {
  horizontal?: BlockScaling
  vertical?: BlockScaling
  Actions?: FC
}

export interface TextProps extends PropsWithChildren<I18nProps>, StyledProps {
  name?: string
  variant?: TextVariant
  center?: boolean
  nested?: boolean
}

export interface LinkProps extends TextProps {
  src?: string
  module?: string | ClientEntrypoint
  open?: boolean
}

export interface StatusProps extends PropsWithChildren<I18nProps> {
  name?: string
  ok?: boolean
  variant?: string
  error?: Error
  message?: string
}
