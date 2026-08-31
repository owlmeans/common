import type { FC } from 'react'
import { createElement, useContext } from 'react'
import { OutletContext } from './context.js'
import { RouteChain } from './chain.js'

/**
 * Renders the next-deeper matched route. Depth is tracked via `OutletContext`, so
 * nested `<Outlet/>`s walk down the match chain — composing with the renderer in
 * `@owlmeans/client` (parent components emit `<Outlet/>`). Component-less matches
 * in between are skipped by `RouteChain` (implicit pass-through).
 */
export const Outlet: FC = () => {
  const { depth } = useContext(OutletContext)

  return createElement(RouteChain, { depth: depth + 1 })
}
