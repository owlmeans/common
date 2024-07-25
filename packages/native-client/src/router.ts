import type { RouterProvider } from '@owlmeans/client'
import { createMemoryRouter } from 'react-router-native'
import type { RouteObject } from 'react-router-native'
import { createElement, Fragment } from 'react'

export const provide: RouterProvider = (routes) => 
  createMemoryRouter(routes.map(route => ({
    ...route, ErrorBoundary: () => {
      return createElement(Fragment)
    }
  }) as RouteObject))
