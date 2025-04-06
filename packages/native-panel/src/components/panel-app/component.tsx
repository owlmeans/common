import type { FC } from 'react'
import type { PanelAppProps } from './types.js'

import { App } from '@owlmeans/client'
import { I18nContext } from '@owlmeans/client-i18n'

import { PaperProvider, MD3LightTheme, configureFonts } from 'react-native-paper'
import type { MD3Theme } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { provide as nativeProvide } from '@owlmeans/native-client'
import { pathchFonts } from './utils/font.js'
import { PanelContext } from '@owlmeans/client-panel'
import { DEFAULT_NAME } from '../../consts.js'
import MaterialIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import Octicons from 'react-native-vector-icons/Octicons'
import { Modal } from '../modal.js'

export const PanelApp: FC<PanelAppProps> = ({ context, provide, children, fonts, colors, name, icons }) => {
  const theme: MD3Theme = {
    ...MD3LightTheme,
    ...(fonts != null ? { fonts: configureFonts({ config: pathchFonts(fonts) }) } : {}),
    ...(colors != null ? { colors: { ...MD3LightTheme, ...colors } } : {})
  }

  theme.roundness = 1.5

  icons = icons ?? {}
  icons['dot'] = props => <Octicons {...props} />
  icons['dot-fill'] = props => <Octicons {...props} />

  return <I18nContext config={context.cfg}>
    <SafeAreaProvider>
      <PaperProvider theme={theme} settings={{
        icon: (props) => icons[props.name] != null
          ? icons[props.name]({ ...props }) : <MaterialIcons {...props} />
      }}>
        <PanelContext resource={name ?? DEFAULT_NAME}>
          <App context={context} provide={provide ?? nativeProvide}>
            {children}
            <Modal />
          </App >
        </PanelContext>
      </PaperProvider>
    </SafeAreaProvider>
  </I18nContext>
}
