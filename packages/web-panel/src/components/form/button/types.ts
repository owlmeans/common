import type { Toggleable } from '@owlmeans/client'
import type { I18nProps } from '@owlmeans/client-i18n'

export interface ButtonProps extends I18nProps {
  size?: 'small' | 'medium' | 'large'
  label: string
  loader?: Toggleable
  onClick?: () => void
}

export interface SubmitProps extends Omit<ButtonProps, "label"> {
  label?: string
  onSubmit?: (data: any) => Promise<void> | void
}
