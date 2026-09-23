import { afterEach, describe, expect, test } from 'bun:test'
import { makeTestContext } from './context.js'
import { makeFixtureKeyPair } from '@owlmeans/test-auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { AuthroizationType, AuthRole, DISPATCHER } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import { HOME } from '@owlmeans/context'
import type { BasicContext, BasicConfig } from '@owlmeans/context'
import { createStaticResource } from '@owlmeans/static-resource'
import type { Resource } from '@owlmeans/resource'
import { FLOW_STATE, RESUME_FLOW } from '@owlmeans/client-flow'
import type { SuspendedLandingRecord } from '@owlmeans/client-flow'
import { DEFAULT_ALIAS as AUTH_ALIAS } from '../src/consts.js'
import type { AuthService } from '@owlmeans/auth-common'
import { appendLogin } from '../src/login/service.js'
import { continueLogin, landAfterLogin, LOGIN_LANDED_STORAGE } from '../src/login/land.js'
import type { LoginLandingHook, LoginService, LoginStep } from '../src/login/types.js'

/**
 * A hand-written `window.localStorage`, not jsdom — `land.ts` reads exactly two keys through
 * `try`/`catch`, and a real DOM would prove a fixture behaves rather than that the module does.
 * Mirrors `web-client/tests/surrogate.spec.ts`'s own `stubWindow` idiom.
 */
const stubStorage = (): void => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, value) },
      removeItem: (key: string) => { store.delete(key) },
    },
  }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

/** A validly-signed bearer, exactly as `server-auth` would issue one. */
const makeBearer = async (auth: Partial<Auth>): Promise<string> => {
  const appKP = makeFixtureKeyPair('client-auth-land-test-key')
  const fullAuth: Auth = {
    token: 'nonce-123', userId: 'user-1', scopes: ['*'], role: AuthRole.User,
    type: AuthroizationType.Ed25519BasicToken, source: 'test-service', isUser: true,
    createdAt: new Date(), ...auth,
  }
  const signed = await makeEnvelopeModel<Auth>(AuthroizationType.Ed25519BasicToken)
    .send(fullAuth, null).sign(appKP, EnvelopeKind.Token)

  return `${AuthroizationType.Ed25519BasicToken.toUpperCase()} ${signed}`
}

const bootstrap = async (opts?: {
  authenticated?: boolean, withFlowState?: boolean
}): Promise<[BasicContext<BasicConfig>, LoginService]> => {
  const context = makeTestContext()
  if (opts?.withFlowState) {
    context.registerResource(
      createStaticResource<SuspendedLandingRecord>(FLOW_STATE, 'client-auth-land-tests')
    )
  }
  context.configure()
  await context.init()

  if (opts?.authenticated) {
    const authService = context.service<AuthService>(AUTH_ALIAS)
    await authService.update(await makeBearer({ userId: 'land-test-user' }))
  }

  const contextual = appendLogin(context)

  return [context, contextual.login()]
}

const step = (over: Partial<LoginStep> & { alias: string, entrypoint: string }): LoginStep => ({
  pending: async () => false, ...over,
})

/** Grant a fake alias existence without building a real entrypoint/route graph. */
const allowEntrypoints = (context: BasicContext<BasicConfig>, ...aliases: string[]): void => {
  (context as unknown as { hasEntrypoint: (alias: string) => boolean }).hasEntrypoint =
    alias => aliases.includes(alias)
}

describe('continueLogin — no steps registered', () => {
  test('falls through to a suspended flow, then HOME', async () => {
    const [context] = await bootstrap({ authenticated: true })

    expect(await continueLogin(context)).toEqual({ alias: HOME })
  })
})

describe('continueLogin — steps', () => {
  test('a pending step lands there, and a suspended landing is NOT consumed', async () => {
    stubStorage()
    const [context, login] = await bootstrap({ authenticated: true, withFlowState: true })
    allowEntrypoints(context, 'step-screen')

    const resource = context.resource<Resource<SuspendedLandingRecord>>(FLOW_STATE)
    await resource.save({
      id: RESUME_FLOW, entrypoint: 'suspended-screen', query: { ref: 'abc' },
      expiresAt: Date.now() + 60_000,
    })

    login.registerStep(step({
      alias: 'consent', entrypoint: 'step-screen', pending: async () => true,
      query: () => ({ from: 'test' }),
    }))

    expect(await continueLogin(context)).toEqual({
      alias: 'step-screen', query: { from: 'test' }, step: 'consent',
    })
    // The suspended landing is still there — a later step, or the eventual fallback, still needs it.
    expect(await resource.load(RESUME_FLOW)).not.toBeNull()
  })

  test('a step whose `pending` throws is treated as not pending — fail open', async () => {
    const [context, login] = await bootstrap({ authenticated: true })
    allowEntrypoints(context, 'broken-screen')

    login.registerStep(step({
      alias: 'broken', entrypoint: 'broken-screen',
      pending: async () => { throw new Error('boom') },
    }))

    expect(await continueLogin(context)).toEqual({ alias: HOME })
  })

  test('a step whose `pending` never resolves is treated as not pending after the timeout', async () => {
    const [context, login] = await bootstrap({ authenticated: true })
    allowEntrypoints(context, 'hanging-screen')

    login.registerStep(step({
      alias: 'hanging', entrypoint: 'hanging-screen',
      pending: () => new Promise<boolean>(() => { /* never settles */ }),
    }))

    expect(await continueLogin(context, { stepTimeout: 20 })).toEqual({ alias: HOME })
  })

  test('a step whose entrypoint is unresolvable is skipped, never throws', async () => {
    const [context, login] = await bootstrap({ authenticated: true })
    let called = false

    login.registerStep(step({
      alias: 'unbound', entrypoint: 'nowhere', pending: async () => { called = true; return true },
    }))

    expect(await continueLogin(context)).toEqual({ alias: HOME })
    expect(called).toBe(false)
  })

  test('`after` skips every step up to and including that alias', async () => {
    const [context, login] = await bootstrap({ authenticated: true })
    allowEntrypoints(context, 'a-screen', 'b-screen')

    login.registerStep(step({ alias: 'a', entrypoint: 'a-screen', priority: 20, pending: async () => true }))
    login.registerStep(step({ alias: 'b', entrypoint: 'b-screen', priority: 10, pending: async () => true }))

    expect(await continueLogin(context)).toEqual({ alias: 'a-screen', query: undefined, step: 'a' })
    expect(await continueLogin(context, { after: 'a' }))
      .toEqual({ alias: 'b-screen', query: undefined, step: 'b' })
  })

  test('an unauthenticated caller with an explicit alias still gets that alias', async () => {
    const [context] = await bootstrap()

    expect(await continueLogin(context, {
      fallback: { alias: 'explicit-alias' }, resume: false,
    })).toEqual({ alias: 'explicit-alias' })
  })
})

describe('landAfterLogin — the surrogate short circuit', () => {
  test('returns DISPATCHER immediately; no step or hook ever runs', async () => {
    const [context, login] = await bootstrap({ authenticated: true })
    login.env = () => ({ hasWindow: true, embedded: true, surrogate: true, hasOpener: true })

    let stepCalled = false
    let hookCalled = false
    login.registerStep(step({
      alias: 'never', entrypoint: 'never-screen', pending: async () => { stepCalled = true; return true },
    }))
    login.onLanded({ alias: 'never', landed: async () => { hookCalled = true } })

    expect(await landAfterLogin(context)).toEqual({ alias: DISPATCHER })
    expect(stepCalled).toBe(false)
    expect(hookCalled).toBe(false)
  })
})

describe('landAfterLogin — landing hooks', () => {
  const hook = (over: Partial<LoginLandingHook> & { alias: string }): LoginLandingHook => ({
    landed: async () => { }, ...over,
  })

  test('run exactly once per distinct token, in priority order, each swallowed on error', async () => {
    stubStorage()
    const [context, login] = await bootstrap({ authenticated: true })

    const order: string[] = []
    login.onLanded(hook({ alias: 'low', priority: 0, landed: async () => { order.push('low') } }))
    login.onLanded(hook({
      alias: 'high', priority: 10, landed: async () => { order.push('high'); throw new Error('boom') },
    }))

    await landAfterLogin(context)
    expect(order).toEqual(['high', 'low'])

    // Same token again — neither hook runs a second time.
    await landAfterLogin(context)
    expect(order).toEqual(['high', 'low'])
  })

  test('a distinct token runs the hooks again', async () => {
    stubStorage()
    const [context, login] = await bootstrap({ authenticated: true })

    let count = 0
    login.onLanded(hook({ alias: 'counter', landed: async () => { count += 1 } }))

    await landAfterLogin(context)
    expect(count).toBe(1)

    const authService = context.service<AuthService>(AUTH_ALIAS)
    await authService.update(await makeBearer({ userId: 'a-different-user' }))

    await landAfterLogin(context)
    expect(count).toBe(2)
  })

  test('storage records the raw token, not a digest, under LOGIN_LANDED_STORAGE', async () => {
    stubStorage()
    const [context] = await bootstrap({ authenticated: true })
    const authService = context.service<AuthService>(AUTH_ALIAS)

    await landAfterLogin(context)

    expect(window.localStorage.getItem(LOGIN_LANDED_STORAGE)).toBe(authService.token as string)
  })
})
