
import type { FC } from 'react'
import { Text as PaperText, useTheme } from 'react-native-paper'
import type { TextProps } from './types.js'
import { usePanelI18n } from '@owlmeans/client-panel'

export const Text: FC<TextProps> = ({ variant, color, name, children, style, cut, center, i18n }) => {
  const theme = useTheme()
  const t = usePanelI18n()
  const label = name != null
    ? i18n?.suppress ? name : t(name)
    : undefined

  return <PaperText variant={variant as any ?? 'bodyMedium'}
    style={[style, center === true ? { textAlign: 'center', } : {}]}
    numberOfLines={cut ? 1 : undefined} ellipsizeMode={cut ? 'tail' : undefined}
    theme={{
      colors: {
        onSurface:
          color != null && theme.colors[color as keyof typeof theme.colors] != null
            ? theme.colors[color as keyof typeof theme.colors]
            : theme.colors.onBackground as any
      }
    }}>{label ?? children}</PaperText>
}
