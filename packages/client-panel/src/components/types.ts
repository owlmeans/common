import type { Toggleable } from '@owlmeans/client'
import type { I18nProps } from '@owlmeans/client-i18n'
import type { PropsWithChildren } from 'react'

export interface TPanelContext extends PropsWithChildren<I18nProps["i18n"]> {
  loader?: Toggleable
}
