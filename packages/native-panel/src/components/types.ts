import type { I18nProps } from '@owlmeans/client-i18n'
import type { PropsWithChildren, FC } from 'react'
import type { TextStyle, ViewStyle } from 'react-native'

export interface ButtonProps extends I18nProps {
  onPress: () => void
  name: string
  color?: string
  textColor?: string
  textVariant?: string
  variant?: 'text' | 'outlined' | 'contained' | 'elevated' | 'contained-tonal'
  icon?: string
  dark?: boolean
  style?: ViewStyle
}

export interface TextProps extends PropsWithChildren<I18nProps> {
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
  onClick?: ListClick<T>
}

export interface ListItemProps<T = any> {
  onClick?: ListClick<T>
  data: T
}

export interface ListClick<T> {
  (data: T): void | Promise<void>
}

export interface StatusProps extends PropsWithChildren<I18nProps> {
  name?: string
  ok?: boolean
  variant?: string
  error?: Error
  message?: string
}
