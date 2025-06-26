import { TextStyle } from 'react-native'

export interface TextValueProps {
  name?: string
  value: string
  color?: string
  valueColor?: string
  nameColor?: string
  copy?: boolean | Function
  style?: TextStyle
}
