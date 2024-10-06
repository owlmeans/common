import type { ReactNode } from 'react'
import type { AppProps } from '@owlmeans/client'
import type { MD3Theme } from 'react-native-paper'
import type { IconProps } from 'react-native-vector-icons/Icon'

export interface PanelAppProps extends AppProps {
  fonts?: PanelAppFont[]
  colors?: MD3Theme["colors"]
  name?: string
  icons?: PanelIconProvider
}

export interface PanelIconProvider {
  [name: string]: (props: IconProps) => ReactNode
}

export interface PanelAppFont {
  groups?: string[]
  sizes?: string[]
  variants?: string[]
  fontFamily: string
}
