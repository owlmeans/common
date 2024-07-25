import type { FC } from 'react'
import type { PanelAppProps } from './types.js'

import { App } from '@owlmeans/client'
import { I18nContext } from '@owlmeans/client-i18n'

import { PaperProvider, MD3LightTheme, configureFonts } from 'react-native-paper'
import type { MD3Theme } from 'react-native-paper'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { provide as nativeProvide } from '@owlmeans/native-client'
import { pathchFonts } from './utils/font.js'

export const PanelApp: FC<PanelAppProps> = ({ context, provide, children, fonts, colors }) => {
  console.log(colors)
  const theme: MD3Theme = {
    ...MD3LightTheme,
    ...(fonts != null ? { fonts: configureFonts({ config: pathchFonts(fonts) }) } : {}),
    ...(colors != null ? { colors: { ...MD3LightTheme, ...colors } } : {})
  }

  theme.roundness = 1.5

  return <I18nContext config={context.cfg}>
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <SafeAreaView>
          <App context={context} provide={provide ?? nativeProvide}>
            {children}
          </App >
        </SafeAreaView>
      </PaperProvider>
    </SafeAreaProvider>
  </I18nContext>
}
