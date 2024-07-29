import type { MutableRefObject } from 'react'
import type { ButtonProps } from '../types.js'
import type { Toggleable } from '@owlmeans/client'

export interface SlowButtonProps extends ButtonProps {
  onPress: () => Promise<void>
  toggleRef?: MutableRefObject<Toggleable>
}
