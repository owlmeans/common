import type { RouterProvider } from '@owlmeans/client'
import { createMemoryRouter } from 'react-router-native'

export const provide: RouterProvider = (routes) => 
  createMemoryRouter(routes)
