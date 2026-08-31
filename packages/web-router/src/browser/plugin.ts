import type { LibraryRouter, RouterPlugin } from '@owlmeans/router'
import { flattenRoutes, rankRouteBranches } from '@owlmeans/router'
import { BROWSER_ROUTER } from '../consts.js'
import { BrowserRouterProvider } from './provider.js'
import { Outlet } from './outlet.js'
import { useLocation, useNavigate, useParams, useSearchParams } from './hooks.js'
import type { OwlLibraryRouter } from './types.js'

/**
 * The default OwlMeans in-browser routing plugin. Standard URL routing over the
 * browser History API. Matches always (priority 0), so it is the universal
 * fallback in the browser; a higher-priority SSR plugin can outrank it later.
 */
export const makeBrowserRouterPlugin = (): RouterPlugin => ({
  alias: BROWSER_ROUTER,
  priority: 0,
  mode: 'browser',
  match: () => true,
  compile: routes => ({
    routes,
    branches: rankRouteBranches(flattenRoutes(routes))
  } satisfies OwlLibraryRouter as LibraryRouter),
  provider: () => BrowserRouterProvider,
  outlet: () => Outlet,
  useParams,
  useLocation,
  useNavigate,
  useSearchParams
})
