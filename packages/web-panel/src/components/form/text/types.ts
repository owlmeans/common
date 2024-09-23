import type { FormFieldProps } from '@owlmeans/client-panel'

export interface TextInputProps extends FormFieldProps {
  name: string
  label?: string | boolean
  placeholder?: string | boolean
  hint?: string | boolean
}
