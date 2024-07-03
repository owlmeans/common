
import type { FC } from 'react'
import type { AppProps } from './types.js'
import { Context } from './context.js'
import { Router } from './router.js'

export const App: FC<AppProps> = ({ context, provide, children }) =>
  <Context value={context}>
    {children}
    {provide != null ? <Router provide={provide} /> : undefined}
  </Context>
