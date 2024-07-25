

import type { FC} from 'react'
import { Button as PaperButton } from 'react-native-paper'
import type { ButtonProps } from './types.js'

export const Button: FC<ButtonProps> = ({ label, onPress }) => {
  return <PaperButton mode="contained" dark onPress={onPress}>{label}</PaperButton>
}
