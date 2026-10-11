import { describe, expect, test } from 'bun:test'
import { makeTestContext } from './context.js'
import { makeFixtureKeyPair } from '@owlmeans/test-auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { AuthroizationType, AuthRole, DISPATCHER } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { createStaticResource } from '@owlmeans/static-resource'
import type { Resource } from '@owlmeans/resource'
import { FLOW_STATE, RESUME_FLOW } from '@owlmeans/client-flow'
import type { SuspendedLandingRecord } from '@owlmeans/client-flow'
import type { AuthService } from '@owlmeans/auth-common'
import { DEFAULT_ALIAS as AUTH_ALIAS } from '../src/consts.js'
import { appendLogin } from '../src/login/service.js'
import { loginLandingOf } from '../src/login/land.js'
import { loginStartOf } from '../src/login/start.js'
import { LoginOutcome } from '../src/login/consts.js'
import type { LoginPlugin, LoginService } from '../src/login/types.js'

/**
 * `useLogin(target)` — sign in FIRST, then land on the target.
 *
 * The hook is a thin React shell over `startLogin` and the login facade, so both halves are
 * exercised here without a DOM: the facade parks the target in the record `resumeSuspendedFlow`
 * reads, the continuation waits for that write and goes to the dispatcher, and the dispatcher's own
 * landing (`landAfterLogin`) ends on the target once a session exists.
 */

let store = 0

/** A validly-signed bearer, exactly as `server-auth` would issue one. */
const makeBearer = async (): Promise<string> => {
  const appKP = makeFixtureKeyPair('client-auth-target-test-key')
  const auth: Auth = {
    token: 'nonce-target', userId: 'target-user', scopes: ['*'], role: AuthRole.User,
    type: AuthroizationType.Ed25519BasicToken, source: 'test-service', isUser: true,
    createdAt: new Date(),
  }
  const signed = await makeEnvelopeModel<Auth>(AuthroizationType.Ed25519BasicToken)
    .send(auth, null).sign(appKP, EnvelopeKind.Token)

  return `${AuthroizationType.Ed25519BasicToken.toUpperCase()} ${signed}`
}

const bootstrap = async (opts?: {
  authenticated?: boolean
}): Promise<[BasicContext<BasicConfig>, LoginService, Resource<SuspendedLandingRecord>]> => {
  const context = makeTestContext()
  context.registerResource(
    createStaticResource<SuspendedLandingRecord>(FLOW_STATE, `client-auth-target-tests-${store++}`)
  )
  context.configure()
  await context.init()
  if (opts?.authenticated === true) {
    await context.service<AuthService>(AUTH_ALIAS).update(await makeBearer())
  }
  const login = appendLogin(context).login()

  return [context, login, context.resource<Resource<SuspendedLandingRecord>>(FLOW_STATE)]
}

/** An ordinary tab: the redirect plugin's `begin` runs the caller's continuation and is done. */
const redirectLike = (): LoginPlugin => ({
  alias: 'redirect-like', match: () => true,
  begin: async (_ctx, request) => {
    await request.navigate?.()

    return LoginOutcome.Handled
  },
  authorize: async () => LoginOutcome.Redirected,
  complete: async () => LoginOutcome.Passed,
})

/** Grant a fake alias existence without building a real entrypoint/route graph. */
const allowEntrypoints = (context: BasicContext<BasicConfig>, ...aliases: string[]): void => {
  (context as unknown as { hasEntrypoint: (alias: string) => boolean }).hasEntrypoint =
    alias => aliases.includes(alias)
}

describe('startLogin — where a "Log in" control goes', () => {
  test('signed out with a target: the continuation is the dispatcher, never the target', async () => {
    const [context, login] = await bootstrap()
    login.registerPlugin(redirectLike())
    const went: string[] = []

    expect(await loginStartOf(context).startLogin({
      url: '/dispatcher', target: 'guarded-screen', go: alias => { went.push(alias) },
    })).toBe(LoginOutcome.Handled)
    expect(went).toEqual([DISPATCHER])
  })

  test('signed in with a target: straight to the target, no sign-in begun', async () => {
    const [context, login] = await bootstrap({ authenticated: true })
    let begun = false
    login.registerPlugin({
      ...redirectLike(), begin: async () => { begun = true; return LoginOutcome.Handled },
    })
    const went: string[] = []

    expect(await loginStartOf(context).startLogin({
      url: '/dispatcher', target: 'guarded-screen', go: alias => { went.push(alias) },
    })).toBe(LoginOutcome.Handled)
    expect(went).toEqual(['guarded-screen'])
    expect(begun).toBe(false)
  })

  test('no target: a sign-in to the dispatcher whether or not a session exists, as always', async () => {
    const [context, login, resource] = await bootstrap({ authenticated: true })
    login.registerPlugin(redirectLike())
    const went: string[] = []

    await loginStartOf(context).startLogin({ url: '/dispatcher', go: alias => { went.push(alias) } })
    expect(went).toEqual([DISPATCHER])
    expect(await resource.load(RESUME_FLOW)).toBeNull()
  })

  test('the plugin is reached synchronously — a window can still open inside the gesture', async () => {
    const [context, login] = await bootstrap()
    let reached = false
    login.registerPlugin({
      ...redirectLike(),
      begin: () => { reached = true; return Promise.resolve(LoginOutcome.Handled) },
    })

    const pending = loginStartOf(context).startLogin({
      url: '/dispatcher', target: 'guarded-screen', go: () => undefined,
    })
    expect(reached).toBe(true)
    await pending
  })
})

describe('the login facade — LoginRequest.target', () => {
  test('the target is parked BEFORE the continuation runs', async () => {
    const [, login, resource] = await bootstrap()
    login.registerPlugin(redirectLike())
    let seen: SuspendedLandingRecord | null = null

    await login.begin({
      url: '/dispatcher', target: 'guarded-screen',
      navigate: async () => { seen = await resource.load(RESUME_FLOW) },
    })
    expect(seen).not.toBeNull()
    expect(seen!.entrypoint).toBe('guarded-screen')
  })

  test('a refusing precondition parks nothing', async () => {
    const [, login, resource] = await bootstrap()
    login.registerPlugin(redirectLike())
    login.registerPrecondition({ alias: 'refuse', check: () => false })

    expect(await login.begin({ url: '/dispatcher', target: 'guarded-screen' }))
      .toBe(LoginOutcome.Gesture)
    expect(await resource.load(RESUME_FLOW)).toBeNull()
  })

  test('an attempt that signs nobody in discards the parked target', async () => {
    for (const outcome of [LoginOutcome.Blocked, LoginOutcome.Failed]) {
      const [, login, resource] = await bootstrap()
      login.registerPlugin({ ...redirectLike(), begin: async () => outcome })

      expect(await login.begin({ url: '/dispatcher', target: 'guarded-screen' })).toBe(outcome)
      // The discard chains on the write; let both settle.
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(await resource.load(RESUME_FLOW)).toBeNull()
    }
  })

  test('without a target the request reaches the plugin untouched', async () => {
    const [, login, resource] = await bootstrap()
    const navigate = (): void => undefined
    let received: unknown = null
    login.registerPlugin({
      ...redirectLike(),
      begin: async (_ctx, request) => { received = request.navigate; return LoginOutcome.Handled },
    })

    await login.begin({ url: '/dispatcher', navigate })
    expect(received).toBe(navigate)
    expect(await resource.load(RESUME_FLOW)).toBeNull()
  })
})

describe('the landing after a targeted sign-in', () => {
  test('the dispatcher lands on the target once signed in', async () => {
    const [context, login] = await bootstrap()
    login.registerPlugin(redirectLike())
    await loginStartOf(context).startLogin({ url: '/dispatcher', target: 'guarded-screen', go: () => undefined })

    await context.service<AuthService>(AUTH_ALIAS).update(await makeBearer())
    expect(await loginLandingOf(context).landAfterLogin()).toEqual({ alias: 'guarded-screen', query: {} })
  })

  test('a pending step runs first, and the target is where the step continues to', async () => {
    const [context, login] = await bootstrap()
    allowEntrypoints(context, 'consent-screen')
    login.registerPlugin(redirectLike())
    let consented = false
    login.registerStep({
      alias: 'consent', entrypoint: 'consent-screen', pending: async () => !consented,
    })
    await loginStartOf(context).startLogin({ url: '/dispatcher', target: 'guarded-screen', go: () => undefined })

    await context.service<AuthService>(AUTH_ALIAS).update(await makeBearer())
    expect(await loginLandingOf(context).landAfterLogin()).toEqual({ alias: 'consent-screen', step: 'consent' })
    consented = true
    expect(await loginLandingOf(context).continueLogin({ after: 'consent' }))
      .toEqual({ alias: 'guarded-screen', query: {} })
  })
})
