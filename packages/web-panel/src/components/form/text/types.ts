import type { FormFieldProps } from '@owlmeans/client-panel'
import type { HTMLInputTypeAttribute } from 'react'

export interface TextInputProps extends FormFieldProps {
  name: string
  label?: string | boolean
  placeholder?: string | boolean
  hint?: string | boolean
  type?: HTMLInputTypeAttribute
}
