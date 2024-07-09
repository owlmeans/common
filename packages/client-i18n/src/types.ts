import { ClientConfig } from '@owlmeans/client-context'
import type { PropsWithChildren } from 'react'

export interface I18nContextProps extends PropsWithChildren {
  config: ClientConfig
}

export interface I18nProps {
  i18n?: {
    resource?: string
    ns?: string
    prefix?: string
    suppress?: boolean
  }
}
