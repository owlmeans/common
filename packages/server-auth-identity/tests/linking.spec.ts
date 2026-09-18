import { describe, expect, test } from 'bun:test'
import { AuthRole } from '@owlmeans/auth'
import { AuthenticationType } from '@owlmeans/auth'
import {
  AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_CREDENTIALS, AUTH_IDENTITY_ORG_ENTITY,
  AUTH_IDENTITY_PROFILE,
} from '../src/consts.js'
import { details, linkingFor, makeCtx } from './context.js'

/**
 * One human, one email, one platform profile — whichever way they sign in.
 *
 * `linkProfile` used to create an organization, an account and a profile on every registration,
 * and registration is per METHOD. The same address signing in by Google and then by key ended up
 * in two entities that could not see each other's projects: `requireEntity` matched neither, and
 * ownership (`project.createdBy`) named a profile the other identity did not have.
 */
describe('linkProfile', () => {
  test('a first sign-in registers an organization, an account and a profile', async () => {
    const ctx = makeCtx()
    const payload = await linkingFor(ctx).linkProfile(
      details('google-oauth', 'google-sub') as never, { username: 'person@example.org' }
    )

    expect(ctx.resources[AUTH_IDENTITY_ORG_ENTITY].items).toHaveLength(1)
    expect(ctx.resources[AUTH_IDENTITY_ACCOUNT].items).toHaveLength(1)
    expect(ctx.resources[AUTH_IDENTITY_PROFILE].items).toHaveLength(1)
    expect(payload.profileId).toStartWith('google-oauth:')
  })

  test('a SECOND method on the same email adds a credential, not an identity', async () => {
    // The whole defect: this used to mint a second organization, and the person's projects
    // became invisible to their other login.
    const ctx = makeCtx()
    const linking = linkingFor(ctx)

    const first = await linking.linkProfile(
      details('google-oauth', 'google-sub') as never, { username: 'person@example.org' }
    )
    const second = await linking.linkProfile(
      details(AuthenticationType.Supervisor, 'person@example.org') as never,
      { username: 'person@example.org' }
    )

    expect(ctx.resources[AUTH_IDENTITY_ORG_ENTITY].items).toHaveLength(1)
    expect(ctx.resources[AUTH_IDENTITY_ACCOUNT].items).toHaveLength(1)
    expect(ctx.resources[AUTH_IDENTITY_PROFILE].items).toHaveLength(1)
    // Two credentials, one per method — which is the point.
    expect(ctx.resources[AUTH_IDENTITY_CREDENTIALS].items).toHaveLength(2)
    expect(ctx.resources[AUTH_IDENTITY_CREDENTIALS].items.map((c: any) => c.type).sort())
      .toEqual(['google-oauth', AuthenticationType.Supervisor].sort())

    // Same identity, same organization — so the same projects.
    expect(second.profileId).toBe(first.profileId)
    expect(second.entitySlug).toBe(first.entitySlug)
  })

  test('a different email is a different person', async () => {
    const ctx = makeCtx()
    const linking = linkingFor(ctx)

    await linking.linkProfile(details('google-oauth', 'a') as never, { username: 'a@example.org' })
    await linking.linkProfile(details('google-oauth', 'b') as never, { username: 'b@example.org' })

    expect(ctx.resources[AUTH_IDENTITY_ORG_ENTITY].items).toHaveLength(2)
    expect(ctx.resources[AUTH_IDENTITY_PROFILE].items).toHaveLength(2)
  })

  test("an organization's END USER row is never mistaken for a platform login", async () => {
    // `inviteUser` writes a row for the same person carrying the same address — the identity the
    // GENERATED application authenticates, deliberately separate from the platform credential. It
    // has no login service on it, and that is what tells the two apart.
    const ctx = makeCtx({
      accounts: [{ id: 'acc-end-user', credential: 'x', name: 'person@example.org', entityId: 'ent-1' }],
      profiles: [{
        id: 'prof-end-user', profileId: 'email-otp:acc-end-user', userId: 'acc-end-user',
        role: AuthRole.User, name: 'person@example.org', email: 'person@example.org',
        entityId: 'ent-1', scopes: ['*'],
      }],
    })

    const payload = await linkingFor(ctx).linkProfile(
      details('google-oauth', 'google-sub') as never, { username: 'person@example.org' }
    )

    // A new platform identity, not a hijack of the end-user row.
    expect(payload.profileId).toStartWith('google-oauth:')
    expect(ctx.resources[AUTH_IDENTITY_PROFILE].items).toHaveLength(2)
  })

  test('force still registers a fresh identity', async () => {
    const ctx = makeCtx()
    const linking = linkingFor(ctx)

    await linking.linkProfile(details('google-oauth', 'a') as never, { username: 'person@example.org' })
    await linking.linkProfile(
      details('google-oauth', 'b') as never, { username: 'person@example.org', force: true }
    )

    expect(ctx.resources[AUTH_IDENTITY_PROFILE].items).toHaveLength(2)
  })
})

/**
 * Forgetting which profile an external login maps to.
 *
 * The mapping is unique on `{type, userId, credential}`, so a caller that has decided the stored
 * one is wrong cannot write over it — it has to be retired first. That is what lets a login path
 * serving a different population than this service's own customers (a target project's end users,
 * say) re-establish an identity of its own for an address that was merged onto a platform one.
 */
describe('unlinkCredentials', () => {
  test('the stored mapping is removed, and only that one', async () => {
    const ctx = makeCtx()
    const linking = linkingFor(ctx)
    await linking.linkProfile(details('email-otp', 'sub-1'), { username: 'person@example.org' })
    await linking.linkProfile(details('google', 'sub-2'), { username: 'person@example.org' })
    expect(ctx.resources[AUTH_IDENTITY_CREDENTIALS].items.length).toBe(2)

    await linking.unlinkCredentials(details('email-otp', 'sub-1'))

    expect(ctx.resources[AUTH_IDENTITY_CREDENTIALS].items.map((c: any) => c.type))
      .toEqual(['google'])
    // And the login is unlinked as far as every reader is concerned.
    expect(await linking.getLinkedProfile(details('email-otp', 'sub-1'))).toBeNull()
  })

  test('a login that maps to nothing is already in the state this promises', async () => {
    const linking = linkingFor(makeCtx())

    expect(await linking.unlinkCredentials(details('email-otp', 'nobody'))).toBeUndefined()
  })
})
