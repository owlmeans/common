import type { FC } from 'react'
import type { RouterModel, RouterProps, RouterProvider } from './types.js'
import { createElement, useEffect, useRef, useState } from 'react'
import { buildEntrypointTree, initializeRouter, visitEntrypointTree } from './utils/router.js'
import { createRouteRenderer } from './utils/route.js'
import { useContext } from './context.js'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from './types.js'
import { assertContext } from '@owlmeans/context'
import type { LibraryRouter, RouteObject } from '@owlmeans/router'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

/** A child path that keeps its leading separator reads as absolute, and the router rejects it. */
const relative = (segment: string): string => {
  segment = segment.trim()
  segment = segment.endsWith('/') ? segment.slice(0, -1) : segment

  return segment.startsWith('/') ? segment.substring(1) : segment
}

export const Router: FC<RouterProps> = ({ provide }) => {
  const progress = useRef(false)
  const context = useContext()

  // Default to the active router plugin's compiler when no explicit provider is
  // passed — this is the standard OwlMeans routing path.
  const provideFn: RouterProvider | undefined = typeof provide === 'function'
    ? (provide as RouterProvider)
    : provide == null
      ? (routes => context.router().compile(routes))
      : undefined

  const [router, setRouter] = useState<LibraryRouter>(
    (provideFn != null ? undefined : provide) as LibraryRouter
  )
  // @TODO We expect that this use memo will do the trick and we don't need to useEffect
  // @TODO Show debug only in debug mode
  useEffect(() => {
    if (!progress.current && !context.cfg.ready) {
      progress.current = true

      if (provideFn != null) {
        initializeRouter(context as any).then(routes => provideFn(routes))
          .then(router => setRouter(router))
      }
    }
  }, [])

  // @TODO We need to allow drawing something here :)
  if (router == null) {
    return undefined
  }

  return createElement(context.router().provider(), { router })
}

export const makeRouterModel = (): RouterModel => {
  const location = `client-router`
  const model: RouterModel = {
    routes: [],
    resolve: async (ctx) => {
      const context = assertContext<Config, Context>(ctx as Context, location)
      const entrypointTree = buildEntrypointTree(context as Context)

      const reactRoutes: RouteObject[] = await visitEntrypointTree(entrypointTree, async (module, children) => {
        const renderer = module.handle != null
          ? { Component: createRouteRenderer({ context, module, hasChildren: children.length > 0 }) }
          : undefined

        // The React tree nests, so each node contributes only its OWN segment — its ancestors are
        // the branches it hangs under and already carry theirs.
        const route: RouteObject = {
          ...(module.route.route.default ? { index: true } as any : undefined),
          ...(!module.route.route.default ? { path: relative(module.segment()), children } : undefined),
          ...renderer
        }

        return route
      })

      return model.routes = reactRoutes
    }
  }

  return model
}
