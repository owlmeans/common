import type {  } from 'react-native-paper'
import type { PropsWithChildren } from 'react'

export interface ButtonProps {
  onPress: () => void
  name: string
}

export interface TextProps extends PropsWithChildren {
  variant?: string
  key?: string
}
