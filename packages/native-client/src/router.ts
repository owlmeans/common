import type { RouterProvider } from '@owlmeans/client'
import { createMemoryRouter } from 'react-router-native'
import type { RouteObject } from 'react-router-native'

export const provide: RouterProvider = async (routes) => {
  return createMemoryRouter(routes as RouteObject[])
}
