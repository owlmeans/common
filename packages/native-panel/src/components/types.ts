import type { PropsWithChildren, FC } from 'react'
import type { TextStyle } from 'react-native'

export interface ButtonProps {
  onPress: () => void
  name: string
  color?: string
  textColor?: string
  textVariant?: string
  variant?: 'text' | 'outlined' | 'contained' | 'elevated' | 'contained-tonal'
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

export interface ListProps<T = any>  {
  items: T[]
  renderer: FC<ListItemProps<T>>
}

export interface ListItemProps<T = any> {
  data: T
}
