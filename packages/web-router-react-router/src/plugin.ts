import type { LibraryRouter, RouteParams, RouterPlugin } from '@owlmeans/router'
import type { RouteObject as ReactRouteObject } from 'react-router'
import {
  Outlet, RouterProvider, createBrowserRouter,
  useLocation as rrUseLocation, useNavigate as rrUseNavigate,
  useParams as rrUseParams, useSearchParams as rrUseSearchParams
} from 'react-router'
import { REACT_ROUTER, REACT_ROUTER_PRIORITY } from './consts.js'

/**
 * React Router v7 as an OwlMeans routing plugin. Extracted from the former
 * `web-router` so react-router is opt-in: register it with `appendReactRouter`
 * (or a `clientPlugin` preference) and its higher priority wins the cascade.
 */
export const makeReactRouterPlugin = (): RouterPlugin => ({
  alias: REACT_ROUTER,
  priority: REACT_ROUTER_PRIORITY,
  mode: 'browser',
  match: () => true,
  compile: routes => createBrowserRouter(routes as ReactRouteObject[]) as unknown as LibraryRouter,
  provider: () => RouterProvider,
  outlet: () => Outlet,
  useParams: <T extends RouteParams = RouteParams>() => rrUseParams() as T,
  useLocation: () => rrUseLocation(),
  useNavigate: () => rrUseNavigate(),
  useSearchParams: init => rrUseSearchParams(init as any) as any
})
