import { useContext, useMemo } from 'react'
import type {
  Location, NavigateFunction, RouteParams, SetSearchParams, UseSearchParamsHook
} from '@owlmeans/router'
import { RouterStateContext } from './context.js'

const useRouterState = () => {
  const state = useContext(RouterStateContext)
  if (state == null) {
    throw new Error('owlmeans-browser-router: router hook used outside of the router provider')
  }
  return state
}

export const useParams = <T extends RouteParams = RouteParams>(): T => {
  const { matches } = useRouterState()
  return (matches[matches.length - 1]?.params ?? {}) as T
}

export const useLocation = (): Location => useRouterState().location

export const useNavigate = (): NavigateFunction => useRouterState().navigate

export const useSearchParams: UseSearchParamsHook = init => {
  const { location, navigate } = useRouterState()

  const search = useMemo(
    () => new URLSearchParams(location.search !== '' ? location.search : (init ?? '')),
    [location.search]
  )

  const setSearch: SetSearchParams = (next, options) => {
    const resolved = typeof next === 'function'
      ? next(new URLSearchParams(location.search))
      : next instanceof URLSearchParams ? next : new URLSearchParams(next)
    const query = resolved.toString()
    const path = `${location.pathname}${query !== '' ? `?${query}` : ''}${location.hash ?? ''}`
    navigate(path, { replace: options?.replace, state: options?.state })
  }

  return [search, setSearch]
}
