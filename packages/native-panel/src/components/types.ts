import type {  } from 'react-native-paper'
import type { PropsWithChildren } from 'react'
import type { TextStyle } from 'react-native'

export interface ButtonProps {
  onPress: () => void
  name: string
  color?: string
  textColor?: string
  dark?: boolean
}

export interface TextProps extends PropsWithChildren {
  variant?: string
  name?: string
  color?: string
  style?: TextStyle
  cut?: boolean
}
