import type { FormFieldProps } from '@owlmeans/client-panel'
import type { SlowButtonProps } from '../button/types.js'

export interface SubmitProps extends Omit<SlowButtonProps, "name" | "onPress"> {
  name?: string
  onSubmit?: (data: any) => Promise<void> | void
}

export interface TextInputProps extends FormFieldProps {
  name: string
  label?: string | boolean
  placeholder?: string | boolean
  hint?: string | boolean
}
