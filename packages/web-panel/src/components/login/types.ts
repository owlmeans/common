import type { LoginScreenProps } from '@owlmeans/client-auth/login'
import type { ComponentType, ReactNode } from 'react'
import type { LoginCreditModel, LoginProviderModel, LoginTermsModel } from '@owlmeans/client-panel/auth'

export interface LoginScreenSetup extends Omit<LoginScreenProps, 'translate'> {
  /** The one thing an application is expected to supply. */
  Logo?: ComponentType<{ className?: string }> | ReactNode
}

export interface LoginCreditProps {
  model: LoginCreditModel
  translate: (key: string, defaultValue: string) => string
  className?: string
}

export interface LoginTermsProps {
  model: LoginTermsModel
  translate: (key: string, defaultValue: string) => string
  /** The current language, for `Intl.ListFormat` and a document's own locale-keyed label. */
  locale?: string
  className?: string
}

export type LoginPrivacyNoticeProps = LoginTermsProps

export interface LoginProviderNoteProps {
  model: LoginProviderModel
  translate: (key: string, defaultValue: string) => string
  className?: string
}
