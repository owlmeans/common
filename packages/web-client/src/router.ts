
import type { RouterProvider } from '@owlmeans/client'
import { createBrowserRouter } from 'react-router'

export const provide: RouterProvider = (routes) => {
  return createBrowserRouter(routes) as any
}
