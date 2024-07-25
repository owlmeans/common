import type { FormFieldProps } from '@owlmeans/client-panel'

export interface TextProps extends FormFieldProps {
  name: string
  label?: string | boolean
  placeholder?: string | boolean
  hint?: string | boolean
}
