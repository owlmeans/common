
import type { RouterProvider } from '@owlmeans/client'
import type { RouteObject } from 'react-router'
import { createBrowserRouter } from 'react-router'

export const provide: RouterProvider = (routes) => {
  return createBrowserRouter(routes as RouteObject[]) as any
}
