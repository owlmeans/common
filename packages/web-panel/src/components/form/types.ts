import type { FormProps } from '@owlmeans/client-panel'
import type { CSSProperties } from 'react'

export interface WebFormProps extends FormProps {
  className?: string
  style?: CSSProperties
}
