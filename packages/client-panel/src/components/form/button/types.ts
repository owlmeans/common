import type { I18nProps } from '@owlmeans/client-i18n'

export interface ButtonProps extends I18nProps {
  label: string
  onClick?: () => void
}

export interface SubmitProps extends Omit<ButtonProps, "label"> {
  label?: string
  onSubmit?: (data: any) => Promise<void> | void
}
