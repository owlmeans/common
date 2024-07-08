import type { FC } from 'react'
import type { RouterModel, RouterProps } from './types.js'
import type { RouteObject } from 'react-router'
import { createElement, useEffect, useRef, useState } from 'react'
import { buildModuleTree, initializeRouter, visitModuleTree } from './utils/router.js'
import { createRouteRenderer } from './utils/route.js'
import { RouterProvider } from 'react-router'
import type { Router as RemixRouter } from '@remix-run/router'
import { useContext } from './context.js'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { assertContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

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
      initializeRouter(context as any).then(router => setRouter(provide(router)))
    }
  }, [])

  // @TODO We need to allow drawing something here :)
  if (router == null) {
    return undefined
  }

  return createElement(RouterProvider, { router: router })
}

export const makeRouterModel = (): RouterModel => {
  const location = `client-router`
  const model: RouterModel = {
    routes: [],
    resolve: async (ctx) => {
      const context = assertContext<Config, Context>(ctx as Context, location)
      const moduleTree = buildModuleTree(context as Context)

      const reactRoutes: RouteObject[] = await visitModuleTree(moduleTree, async (module, children) => {
        const ctx = assertContext<BasicConfig, BasicContext<BasicConfig>>(
          (module.ctx ?? context) as BasicContext<BasicConfig>, location
        )
        await module.route.resolve(ctx)

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
