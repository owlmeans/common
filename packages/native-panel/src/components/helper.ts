import { useMemo } from 'react'
import { useTheme } from 'react-native-paper'

export const useColors = (colors: Record<string, string>): Record<string, string> => {
  const theme = useTheme()
  return useMemo(() =>
    Object.fromEntries(Object.entries(colors)
      .map(([key, color]) => [key, theme.colors[color as keyof typeof theme.colors] as string ?? color])
    ), Object.values(colors)
  )
}
