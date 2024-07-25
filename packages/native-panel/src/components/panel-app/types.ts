import type { AppProps } from '@owlmeans/client'
import type { MD3Theme } from 'react-native-paper'

export interface PanelAppProps extends AppProps {
  fonts?: PanelAppFont[]
  colors?: MD3Theme["colors"]
  name?: string
}

export interface PanelAppFont {
  groups?: string[]
  sizes?: string[]
  variants?: string[]
  fontFamily: string
}
