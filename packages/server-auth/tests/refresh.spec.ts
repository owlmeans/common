import { describe, expect, test } from 'bun:test'
import { AuthRole } from '@owlmeans/auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { Auth } from '@owlmeans/auth'
import type { IdentityAccount, IdentityProfile } from '@owlmeans/server-auth-identity'
import { AUTH_SESSION_MANAGER } from '@owlmeans/server-auth-session'
import type { AuthSessionManager } from '@owlmeans/server-auth-session'
import { makeTestContext, signInThrough, throughGuard } from './context.js'

const MAIN = 'entity-main'
const OTHER = 'entity-other'

const account: IdentityAccount = {
  id: 'account-1', credential: 'key-1', email: 'person@example.org', name: 'Person', entityId: MAIN, scopes: [],
}

const rowIn = (entityId: string, fields: Partial<IdentityProfile> = {}): IdentityProfile => ({
  id: `row-${entityId}`, profileId: 'app:profile-1', userId: account.id, service: 'app', entityId,
  role: AuthRole.User, scopes: ['*'], permissions: [], name: 'Person', ...fields,
})

/**
 * A server whose registry revises a profile after the token was issued, so the next request takes the
 * refresh branch and re-reads the row: the account, its PRIMARY row (main organization) and a
 * membership row in another organization.
 */
const setup = async () => {
  const { context, identity } = makeTestContext({ sessions: true, identity: true })
  context.configure()
  await context.init()
  await identity!.accounts.create({ ...account })
  await identity!.profiles.create(rowIn(MAIN, { owner: true, role: AuthRole.Admin }))
  await identity!.profiles.create(rowIn(OTHER))
  const sessions = context.service<AuthSessionManager>(AUTH_SESSION_MANAGER)

  /** A registry revision of the profile in `entityId`: its next request takes the refresh branch. */
  const revise = async (entityId: string): Promise<void> => {
    const selector = { entityId, profileId: 'app:profile-1' }
    const operation = `op-${crypto.randomUUID()}`
    await sessions.fence(selector, operation)
    await sessions.refresh(selector, operation)
  }

  const signIn = async (entityId: string = MAIN): Promise<string> =>
    (await signInThrough(context, { userId: account.id, profileId: 'app:profile-1', entitySlug: entityId })).bearer

  const write = async <T extends { id: string }>(resource: { get: (id: string) => Promise<T>, update: (record: T) => Promise<T> }, id: string, fields: Partial<T>) =>
    await resource.update({ ...await resource.get(id), ...fields })

  return {
    context, signIn, revise,
    ban: async (disabled: boolean) => { await write(identity!.accounts, account.id, { disabled }) },
    disable: async (entityId: string, disabled: boolean) => { await write(identity!.profiles, `row-${entityId}`, { disabled }) },
  }
}

describe('@owlmeans/server-auth — a token refresh re-checks the person', () => {
  test('an admitted person is re-signed with the row as it is now', async () => {
    const { context, signIn, revise } = await setup()
    const bearer = await signIn()
    await revise(MAIN)

    const result = await throughGuard(context, bearer)

    expect(result.admitted).toBe(true)
    expect(result.update).toStartWith('ED25519-BASIC-TOKEN ')
    const refreshed = makeEnvelopeModel<Auth>(result.update!.split(' ')[1]!, EnvelopeKind.Token).message()
    expect(refreshed.role).toBe(AuthRole.Admin)
  })

  test('a ban ends the session at its next refresh (the 401 path); a lift admits again', async () => {
    const { context, signIn, revise, ban } = await setup()
    const bearer = await signIn()
    await ban(true)
    await revise(MAIN)

    expect(await throughGuard(context, bearer)).toEqual({ admitted: false, auth: null })

    await ban(false)
    expect((await throughGuard(context, bearer)).admitted).toBe(true)
  })

  test("a disabled PRIMARY row ends the app's sessions in every organization", async () => {
    const { context, signIn, revise, disable } = await setup()
    const primary = await signIn(MAIN)
    const member = await signIn(OTHER)
    await disable(MAIN, true)
    await revise(MAIN)
    await revise(OTHER)

    expect((await throughGuard(context, primary)).admitted).toBe(false)
    expect((await throughGuard(context, member)).admitted).toBe(false)
  })

  test('a disabled membership row is not the primary one and refuses nothing at refresh', async () => {
    const { context, signIn, revise, disable } = await setup()
    const member = await signIn(OTHER)
    await disable(OTHER, true)
    await revise(OTHER)

    expect((await throughGuard(context, member)).admitted).toBe(true)
  })
})
