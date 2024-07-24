import type { RouterProvider } from '@owlmeans/client'
import { createMemoryRouter } from 'react-router-native'

export const provide: RouterProvider = (routes) => {
  return createMemoryRouter(routes)
}
