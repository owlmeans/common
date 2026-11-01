import { describe, expect, test } from 'bun:test'
import { AuthenFailed, AuthRole } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { addLogPlugin, memoryPlugin } from '@owlmeans/log'
import { AUTH_SESSION_MANAGER } from '@owlmeans/server-auth-session'
import type { AuthSessionManager } from '@owlmeans/server-auth-session'
import { DEFAULT_ALIAS } from '../src/consts.js'
import { authEvents } from '../src/index.js'
import type { AuthService } from '../src/types.js'
import { makeTestContext, signInThrough, throughGuard } from './context.js'

const who = { userId: 'account-1', profileId: 'profile-1', entitySlug: 'entity-1' }

/**
 * A server context whose listeners are registered while it is still being wired, before `init` —
 * first `register`'s, then one that records every `auth` it is handed.
 */
const setup = async (register: (context: BasicContext<BasicConfig>) => void = () => undefined) => {
  const { context, identity } = makeTestContext({ sessions: true, identity: true })
  // The row a refresh re-reads: the account's primary row in its main organization.
  await identity!.accounts.create({
    id: who.userId, credential: 'key-1', email: 'person@example.org', name: 'Person', entityId: who.entitySlug, scopes: [],
  })
  await identity!.profiles.create({
    id: 'row-1', profileId: who.profileId, userId: who.userId, service: 'app', entityId: who.entitySlug,
    role: AuthRole.User, scopes: ['*'], permissions: [], name: 'Person',
  })
  const seen: Auth[] = []
  register(context)
  authEvents(context)!.onAuthenticated(async auth => { seen.push(auth) })
  context.configure()
  await context.init()

  return { context, seen, sessions: context.service<AuthSessionManager>(AUTH_SESSION_MANAGER) }
}

describe('@owlmeans/server-auth — onAuthenticated', () => {
  test('runs once per exchange, after the session is registered, with what the token carries', async () => {
    const observed: { state?: string, ctx?: unknown } = {}
    const { context, seen } = await setup(context => {
      authEvents(context)!.onAuthenticated(async (auth, ctx) => {
        observed.ctx = ctx
        observed.state = (await ctx.service<AuthSessionManager>(AUTH_SESSION_MANAGER).inspect(auth.sessionId!)).state
      })
    })

    await signInThrough(context, who)

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ ...who, sessionId: expect.any(String), expiresAt: expect.any(Date) })
    expect(observed).toEqual({ state: 'active', ctx: context })
  })

  test('a failing listener is logged and never fails the sign-in; the next listener still runs', async () => {
    const memory = memoryPlugin()
    const remove = addLogPlugin(memory)
    try {
      const { context, seen } = await setup(context => {
        authEvents(context)!.onAuthenticated(async () => { throw new Error('stamp store is down') })
      })

      const { bearer } = await signInThrough(context, who)

      expect(bearer).toStartWith('ED25519-BASIC-TOKEN ')
      expect(seen).toHaveLength(1)
      expect(memory.records).toContainEqual(expect.objectContaining({
        level: 'error', scope: 'server-auth', message: 'Sign-in listener failed',
      }))
    } finally {
      remove()
    }
  })

  test('never on a token refresh, nor on a refused exchange', async () => {
    const { context, seen, sessions } = await setup()
    const { credential, bearer } = await signInThrough(context, who)
    expect(seen).toHaveLength(1)

    // The registry revises the profile: the next request re-signs the token's claims.
    const selector = { entityId: who.entitySlug, profileId: who.profileId }
    await sessions.fence(selector, 'op-1')
    await sessions.refresh(selector, 'op-1')
    const refreshed = await throughGuard(context, bearer)
    expect(refreshed.admitted).toBe(true)
    expect(refreshed.update).toBeString()

    // The same credential twice is a replay.
    await expect(context.service<AuthService>(DEFAULT_ALIAS).authenticate({ token: credential }))
      .rejects.toBeInstanceOf(AuthenFailed)

    expect(seen).toHaveLength(1)
  })
})
