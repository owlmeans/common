
import type { RouterProvider } from '@owlmeans/client'
import { createBrowserRouter } from 'react-router-dom'

export const provide: RouterProvider = (routes) => {
  return createBrowserRouter(routes)
}
