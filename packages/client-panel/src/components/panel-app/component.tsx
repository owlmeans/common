import type { FC } from 'react'
import type { PanelAppProps } from './types.js'

import { App } from '@owlmeans/client'
import { I18nContext } from '@owlmeans/client-i18n'
import CssBaseline from '@mui/material/CssBaseline'

export const PanelApp: FC<PanelAppProps> = ({ context, provide, children }) => {
  return <I18nContext config={context.cfg}>
    <App context={context} provide={provide}>
      <CssBaseline />
      {children}
    </App >
  </I18nContext >
}
