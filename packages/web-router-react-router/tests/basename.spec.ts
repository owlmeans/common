import { afterEach, describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import { ROUTER_SERVICE } from '@owlmeans/router'
import type { RouteObject, RouterService } from '@owlmeans/router'
import type { DataRouter } from 'react-router'
import { appendReactRouter, makeReactRouterPlugin } from '../src/index.js'

/**
 * A hand-written browser, not jsdom: react-router's browser history reads `location` and
 * `history` off `window` and listens for `popstate`, and what this spec asserts is the address it
 * hands to `pushState` — a real DOM would prove the fixture behaves rather than the basename.
 */
const stubBrowser = (pathname: string, search = ''): { pushed: string[] } => {
  const pushed: string[] = []
  let state: unknown = null
  const win = {
    location: { pathname, search, hash: '', origin: 'http://localhost', href: `http://localhost${pathname}${search}` },
    history: {
      get state () { return state },
      pushState: (next: unknown, _title: string, url: string) => { state = next; pushed.push(url) },
      replaceState: (next: unknown) => { state = next },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const scope = globalThis as unknown as { window: unknown, document: unknown }
  scope.window = win
  scope.document = { defaultView: win }

  return { pushed }
}

afterEach(() => {
  const scope = globalThis as { window?: unknown, document?: unknown }
  delete scope.window
  delete scope.document
})

const contextWith = (base?: string) => makeBasicContext<BasicConfig>({
  ready: false, service: 'web', type: AppType.Frontend,
  services: { web: { service: 'web', type: AppType.Frontend, host: 'localhost', ...(base != null ? { base } : {}) } },
})

const routes: RouteObject[] = [
  { path: '/', children: [{ path: 'users', children: [{ index: true }, { path: ':id' }] }] },
]

const matchedOf = (router: DataRouter): (string | undefined)[] =>
  router.state.matches.map(match => match.route.index === true ? '(index)' : match.route.path)

describe('@owlmeans/web-router-react-router — the application base as basename', () => {
  test('a mounted application matches base-less routes and pushes base-joined addresses', async () => {
    const browser = stubBrowser('/app/users')
    const ctx = appendReactRouter(contextWith('app/'))
    const router = await ctx.service<RouterService>(ROUTER_SERVICE).compile(routes) as DataRouter
    try {
      expect(router.basename).toBe('/app')
      expect(matchedOf(router)).toEqual(['/', 'users', '(index)'])

      await router.navigate('/users/7?token=abc')
      expect(browser.pushed).toEqual(['/app/users/7?token=abc'])
      expect(matchedOf(router)).toEqual(['/', 'users', ':id'])
    } finally {
      router.dispose()
    }
  })

  test('a root base passes no basename, and addresses stay exactly as before', async () => {
    for (const base of [undefined, '', '/']) {
      const browser = stubBrowser('/users')
      const router = await makeReactRouterPlugin().compile(routes, contextWith(base)) as DataRouter
      try {
        expect(router.basename).toBe('/')
        expect(matchedOf(router)).toEqual(['/', 'users', '(index)'])

        await router.navigate('/users/7?token=abc')
        expect(browser.pushed).toEqual(['/users/7?token=abc'])
      } finally {
        router.dispose()
      }
    }
  })

  test('compiled without a context, it is the root', async () => {
    const browser = stubBrowser('/users/3')
    const router = await makeReactRouterPlugin().compile(routes) as DataRouter
    try {
      expect(router.basename).toBe('/')
      expect(matchedOf(router)).toEqual(['/', 'users', ':id'])
      await router.navigate('/users')
      expect(browser.pushed).toEqual(['/users'])
    } finally {
      router.dispose()
    }
  })
})
