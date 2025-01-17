import type { SxProps } from '@mui/material/styles'
import type { I18nProps } from '@owlmeans/client-i18n'
import type { BlockScaling } from '@owlmeans/client-panel'
import type { FC, PropsWithChildren } from 'react'
import type { Variant } from '@mui/material/styles/createTypography'
import type { ClientModule } from '@owlmeans/client-module'

export interface BlockProps extends PropsWithChildren<I18nProps> {
  horizontal?: BlockScaling
  vertical?: BlockScaling
  Actions?: FC
  styles?: SxProps
}

export interface TextProps extends PropsWithChildren<I18nProps> {
  name?: string
  variant?: Variant
  center?: boolean
  styles?: SxProps
  nested?: boolean
}

export interface LinkProps extends TextProps {
  src?: string
  module?: string | ClientModule
  open?: boolean
}

export interface StatusProps extends PropsWithChildren<I18nProps> {
  name?: string
  ok?: boolean
  variant?: string
  error?: Error
  message?: string
}
