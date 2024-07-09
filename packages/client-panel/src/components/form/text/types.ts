import type { FormFieldProps } from '../types.js'

export interface TextProps extends FormFieldProps {
  name: string
  label?: string | boolean
  placeholder?: string | boolean
  hint?: string | boolean
}
