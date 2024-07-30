import type {  } from 'react-native-paper'
import type { PropsWithChildren } from 'react'
import type { TextStyle } from 'react-native'

export interface ButtonProps {
  onPress: () => void
  name: string
  color?: string
  textColor?: string
  textVariant?: string
  icon?: string
  dark?: boolean
}

export interface TextProps extends PropsWithChildren {
  variant?: string
  name?: string
  color?: string
  style?: TextStyle
  cut?: boolean
  center?: boolean
}

export interface DotsProps {
  qty?: number
  active?: number
  gap?: number
  color?: string
  activeColor?: string
}
