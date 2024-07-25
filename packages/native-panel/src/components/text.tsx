
import type { FC } from 'react'
import { Text as PaperText, useTheme } from 'react-native-paper'
import type { TextProps } from './types.js'
import { usePanelI18n } from '@owlmeans/client-panel'

export const Text: FC<TextProps> = ({ variant, key, children }) => {
  const theme = useTheme()
  const t = usePanelI18n()
  const label = key != null ? t(key) : undefined

  return <PaperText variant={variant as any ?? 'bodyMedium'}
    theme={{ colors: { onSurface: theme.colors.onBackground } }}>{label ?? children}</PaperText>
}
