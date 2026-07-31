import type { FC } from 'react'
import { createElement, useContext } from 'react'
import { RouterStateContext, OutletContext } from './context.js'

/**
 * Renders the next-deeper matched route. Depth is tracked via `OutletContext`, so
 * nested `<Outlet/>`s walk down the match chain — composing with the renderer in
 * `@owlmeans/client` (parent components emit `<Outlet/>`).
 */
export const Outlet: FC = () => {
  const state = useContext(RouterStateContext)
  const { depth } = useContext(OutletContext)

  const Component = state?.matches[depth + 1]?.route.Component
  if (Component == null) {
    return null
  }

  return createElement(
    OutletContext.Provider,
    { value: { depth: depth + 1 } },
    createElement(Component)
  )
}
