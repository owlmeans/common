

import type { FC } from 'react'
import { Button as PaperButton, useTheme } from 'react-native-paper'
import type { ButtonProps } from './types.js'
import { usePanelI18n } from '@owlmeans/client-panel'

export const Button: FC<ButtonProps> = ({ dark, name, onPress, color, textColor }) => {
  const t = usePanelI18n()
  const theme = useTheme()

  return <PaperButton mode="contained" dark={dark ?? true} onPress={onPress}
    textColor={textColor != null ? theme.colors[textColor as keyof typeof theme.colors] as any : undefined}
    buttonColor={color != null ? theme.colors[color as keyof typeof theme.colors] as any : undefined}
  >{`${t(`${name}.label`)}`}</PaperButton>
}
