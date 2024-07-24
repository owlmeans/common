import type { FC } from 'react'
import type { PanelAppProps } from './types.js'

import { App } from '@owlmeans/client'
import { I18nContext } from '@owlmeans/client-i18n'

import { PaperProvider } from 'react-native-paper'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { provide as nativeProvide } from '@owlmeans/native-client'

export const PanelApp: FC<PanelAppProps> = ({ context, provide, children }) => {
  return <I18nContext config={context.cfg}>
    <SafeAreaProvider>
      <PaperProvider>
        <SafeAreaView>
          <App context={context} provide={provide ?? nativeProvide}>
            {children}
          </App >
        </SafeAreaView>
      </PaperProvider>
    </SafeAreaProvider>
  </I18nContext>
}
