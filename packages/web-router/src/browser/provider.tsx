import type { FC } from 'react'
import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import type { LibraryRouter, Location, NavigateFunction } from '@owlmeans/router'
import { matchRoutes } from '@owlmeans/router'
import { createBrowserHistory } from './history.js'
import { RouterStateContext } from './context.js'
import { RouteChain } from './chain.js'
import type { OwlLibraryRouter } from './types.js'

/**
 * Renders the OwlMeans library router. Subscribes to history, recomputes the
 * matched route chain on navigation, and renders the top match. Initial render
 * matches synchronously from `window.location` to avoid a first-paint flash.
 */
export const BrowserRouterProvider: FC<{ router: LibraryRouter }> = ({ router }) => {
  const lib = router as OwlLibraryRouter
  const historyRef = useRef(createBrowserHistory())
  const history = historyRef.current

  const [location, setLocation] = useState<Location>(() => history.location)

  useEffect(() => history.listen(setLocation), [])

  const matches = useMemo(
    () => matchRoutes(lib.branches, location.pathname) ?? [],
    [lib, location.pathname]
  )

  const navigate = useMemo<NavigateFunction>(() => ((to: string | number | { pathname?: string, search?: string, hash?: string }, options?: { replace?: boolean, state?: any }) => {
    if (typeof to === 'number') {
      history.go(to)
      return
    }
    if (typeof to === 'string' && to.startsWith('http')) {
      window.location.href = to
      return
    }
    const path = typeof to === 'string'
      ? to
      : `${to.pathname ?? ''}${to.search ?? ''}${to.hash ?? ''}`
    if (options?.replace) {
      history.replace(path, options.state)
    } else {
      history.push(path, options?.state)
    }
  }) as NavigateFunction, [history])

  return createElement(
    RouterStateContext.Provider,
    { value: { location, matches, navigate } },
    createElement(RouteChain, { depth: 0 })
  )
}
