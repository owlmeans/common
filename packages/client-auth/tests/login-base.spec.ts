import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Context } from '@owlmeans/client'
import type { ClientContext } from '@owlmeans/client'
import type { LibraryRouter } from '@owlmeans/router'
import { makeBrowserTestContext } from './context.js'
import { useLogin } from '../src/login/hook.js'
import { surrogatePath } from '../src/login/surrogate.js'
import { appendLogin } from '../src/login/service.js'
import { LoginIntent, LoginOutcome } from '../src/login/consts.js'
import { pluginMethodSource } from '../src/manager/plugins/methods.js'
import { authPluginHelper } from '../src/manager/plugins/registry.js'
import type { LoginContext, LoginEnv, LoginRequest } from '../src/login/types.js'

/**
 * Where a sign-in control points, and where a sign-in window opens, for an application its host
 * serves under `/app` — and, unchanged, for one at the root.
 *
 * `useLogin` is rendered for real: inside the application's context and the OwlMeans browser
 * router, on the server (no `window`, so the router's history is its inert stub), which is all a
 * hook that only reads entrypoints and the context needs.
 */

const ROOTS = [undefined, '', '/']

const env: LoginEnv = { hasWindow: true, embedded: false, surrogate: false, hasOpener: false }

/** What `useLogin()` returns its control, rendered inside `context`. */
const loginHrefOf = async (context: ClientContext): Promise<string> => {
  let seen: string | undefined
  const Probe = () => {
    seen = useLogin()[0]
    return null
  }
  const router = context.router()
  const compiled = await router.compile([{ index: true, Component: Probe }]) as LibraryRouter
  renderToStaticMarkup(createElement(Context, { value: context }, createElement(router.provider(), { router: compiled })))
  if (seen == null) throw new Error('the probe never rendered')

  return seen
}

/** The address a registered sign-in method hands to `login.begin`. */
const methodUrlOf = async (context: ClientContext, type: string): Promise<string> => {
  const requests: LoginRequest[] = []
  const login = appendLogin(context).login()
  login.registerPlugin({
    alias: 'capture', match: () => true,
    begin: async (_ctx, request) => { requests.push(request); return LoginOutcome.Handled },
    authorize: async () => LoginOutcome.Passed,
    complete: async () => LoginOutcome.Passed,
  })
  authPluginHelper.registerAuthPlugin({ type, Implementation: () => () => null, method: {} })
  const method = pluginMethodSource.list({ context, env }).find(item => item.id === type)
  if (method == null) throw new Error(`method ${type} is not offered`)
  await method.start({ context, env })

  return requests[0]?.url ?? ''
}

describe('@owlmeans/client-auth — sign-in addresses under /app', () => {
  test('useLogin points the control at the dispatcher under the base', async () => {
    expect(await loginHrefOf(makeBrowserTestContext('app'))).toBe('/app/dispatcher')
    expect(await loginHrefOf(makeBrowserTestContext('/app/'))).toBe('/app/dispatcher')
  })

  test('the surrogate window opens under the base; next is passed through as given', () => {
    const ctx = makeBrowserTestContext('/app') as unknown as LoginContext

    expect(surrogatePath(ctx, { intent: LoginIntent.Logout })).toBe('/app/surrogate?intent=logout')
    expect(surrogatePath(ctx, { intent: LoginIntent.Login, next: '/app/dispatcher', method: 'oidc' }))
      .toBe('/app/surrogate?intent=login&next=%2Fapp%2Fdispatcher&method=oidc')
  })

  test('a sign-in method begins at its screen under the base', async () => {
    expect(await methodUrlOf(makeBrowserTestContext('/app'), 'base-mounted-method'))
      .toBe('/app/authentication/login/base-mounted-method')
  })
})

describe('@owlmeans/client-auth — sign-in addresses at the root stay as they were', () => {
  test('useLogin, the surrogate and a method address exactly the declared paths', async () => {
    for (const [index, base] of ROOTS.entries()) {
      const context = makeBrowserTestContext(base)

      expect(await loginHrefOf(context)).toBe('/dispatcher')
      expect(surrogatePath(context as unknown as LoginContext, { intent: LoginIntent.Login, next: '/dispatcher' }))
        .toBe('/surrogate?intent=login&next=%2Fdispatcher')
      expect(await methodUrlOf(context, `root-method-${index}`)).toBe(`/authentication/login/root-method-${index}`)
    }
  })
})
