
import type { FC } from 'react'
import type { AppProps } from './types.js'
import { useEffect, useState } from 'react'
import { Context } from './context.js'
import { Router } from './router.js'

export const App: FC<AppProps> = ({ context, provide, noRouter, children }) => {
  const [render, rerender] = useState(0)

  useEffect(() => context.registerRerenderer(() => rerender(render + 1)), [])

  return <Context value={context}>
    {children}
    {noRouter !== true ? <Router provide={provide} /> : undefined}
  </Context>
}
