import type { Location } from '@owlmeans/router'
import { routerBaseHelper } from '@owlmeans/router'
import type { BrowserHistory } from './types.js'

/**
 * Minimal history wrapping the browser `window.history` + `popstate`. When no
 * `window` is present (SSR) it returns an inert stub — the browser plugin is only
 * *selected* in the browser, so this is purely defensive.
 *
 * `basename` is the application's own base (`/admin` for an application the host
 * serves under `/admin`; `''` at the root). Every location this history reports is
 * base-less, and a root-relative address pushed or replaced gets the base in front —
 * so routes, `useLocation()` and `navigate('/users')` never see it. At the root both
 * directions are the identity.
 */
export const createBrowserHistory = (basename: string = ''): BrowserHistory => {
  if (typeof window === 'undefined') {
    const stub: Location = { pathname: '/', search: '', hash: '', state: null, key: '0' }
    return {
      get location() { return stub },
      push: () => { }, replace: () => { }, go: () => { }, listen: () => () => { }
    }
  }

  const listeners = new Set<(location: Location) => void>()
  let counter = 0

  const currentLocation = (): Location => ({
    pathname: routerBaseHelper.strip(window.location.pathname, basename),
    search: window.location.search,
    hash: window.location.hash,
    state: window.history.state ?? null,
    key: String(counter)
  })

  const notify = () => {
    const location = currentLocation()
    listeners.forEach(callback => callback(location))
  }

  window.addEventListener('popstate', () => {
    counter++
    notify()
  })

  return {
    get location() { return currentLocation() },
    push: (to, state) => {
      counter++
      window.history.pushState(state ?? null, '', routerBaseHelper.join(basename, to))
      notify()
    },
    replace: (to, state) => {
      window.history.replaceState(state ?? null, '', routerBaseHelper.join(basename, to))
      notify()
    },
    go: delta => { window.history.go(delta) },
    listen: callback => {
      listeners.add(callback)
      return () => { listeners.delete(callback) }
    }
  }
}
