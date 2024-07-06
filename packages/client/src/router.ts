import type { FC } from 'react'
import type { RouterModel, RouterProps } from './types.js'
import type { RouteObject } from 'react-router'
import { createElement, useEffect, useRef, useState } from 'react'
import { buildModuleTree, initializeRouter, visitModuleTree } from './utils/router.js'
import { createRouteRenderer } from './utils/route.js'
import { RouterProvider } from 'react-router'
import type { Router as RemixRouter } from '@remix-run/router'
import { useContext } from './context.js'

export const Router: FC<RouterProps> = ({ provide }) => {
  const progress = useRef(false)
  const context = useContext()

  const [router, setRouter] = useState<RemixRouter>()
  // @TODO We expect that this use memo will do the trick and we don't need to useEffect
  // @TODO Show debug only in debug mode
  useEffect(() => {
    if (!progress.current && !context.cfg.ready) {
      progress.current = true

      console.log('Initialize router')
      initializeRouter(context).then(router => setRouter(provide(router)))
    }
  }, [])

  // @TODO We need to allow drawing something here :)
  if (router == null) {
    return undefined
  }

  return createElement(RouterProvider, { router: router })
}

export const makeRouterModel = (): RouterModel => {
  const model: RouterModel = {
    routes: [],
    resolve: async (context) => {
      const moduleTree = buildModuleTree(context)

      const reactRoutes: RouteObject[] = await visitModuleTree(moduleTree, async (module, children) => {
        await module.route.resolve(module.ctx ?? context)

        const route: RouteObject = {
          ...(module.route.route.default ? { index: true } as any : undefined),
          ...(!module.route.route.default ? { path: module.getPath(module.hasParent()), children } : undefined),
          Component: createRouteRenderer({ context, module, hasChildren: children.length > 0 })
        }

        return route
      })

      return model.routes = reactRoutes
    }
  }

  return model
}
