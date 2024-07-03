import type { FC } from 'react'
import type { PanelAppProps } from './types.js'

import { App } from '@owlmeans/client'
import CssBaseline from '@mui/material/CssBaseline'

export const PanelApp: FC<PanelAppProps> = ({ context, provide, children }) =>
  <App context={context} provide={provide}>
    <CssBaseline />
    {children}
  </App>
