import type { FC } from 'react'
import { createElement, useContext } from 'react'
import { RouterStateContext, OutletContext } from './context.js'

/**
 * Renders the matched route chain starting at `depth`.
 *
 * A matched route that carries no `Component` is a **pass-through**: it renders
 * the next-deeper match, exactly like react-router's implicit `<Outlet/>` for
 * element-less routes. OwlMeans entrypoint trees depend on this — grouping
 * entrypoints (e.g. `client-authentication` → `client-authentication:authentication`)
 * have no handler, so `@owlmeans/client` emits `RouteObject`s without a `Component`
 * for them. Rendering only the exact node at `depth` would leave the whole
 * subtree blank whenever a group sits above the screen entrypoint.
 */
export const RouteChain: FC<{ depth: number }> = ({ depth }) => {
  const state = useContext(RouterStateContext)
  const matches = state?.matches ?? []

  let current = depth
  while (current < matches.length && matches[current].route.Component == null) {
    current++
  }

  const Component = matches[current]?.route.Component
  if (Component == null) {
    return null
  }

  return createElement(
    OutletContext.Provider,
    { value: { depth: current } },
    createElement(Component)
  )
}
