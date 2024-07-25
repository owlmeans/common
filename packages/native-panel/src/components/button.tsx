

import type { FC} from 'react'
import { Button as PaperButton } from 'react-native-paper'
import type { ButtonProps } from './types.js'
import { usePanelI18n } from '@owlmeans/client-panel'

export const Button: FC<ButtonProps> = ({ name, onPress }) => {
  const t = usePanelI18n()

  return <PaperButton mode="contained" dark onPress={onPress}>{`${t(`${name}.label`)}`}</PaperButton>
}
