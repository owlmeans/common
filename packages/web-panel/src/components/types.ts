import type { SxProps } from '@mui/material/styles'
import type { I18nProps } from '@owlmeans/client-i18n'
import type { BlockScaling } from '@owlmeans/client-panel'
import type { FC, PropsWithChildren } from 'react'

export interface BlockProps extends PropsWithChildren<I18nProps> {
  horizontal?: BlockScaling
  Actions?: FC
  styles?: SxProps
}

export interface TextProps extends PropsWithChildren {
  name?: string
  variant?: string
  center?: boolean
}

export interface StatusProps extends PropsWithChildren<I18nProps> {
  name?: string
  ok?: boolean
  variant?: string
  error?: Error
  message?: string
}
