import { describe, expect, test } from 'bun:test'
import { AuthenticationType, AuthRole } from '@owlmeans/auth'
import { identityOf } from '../src/identity.js'
import { identityKeyHelper } from '../src/keys.js'
import { DEFAULT_APP_SERVICE } from '../src/consts.js'
import { details, makeIdentityContext } from './context.js'

/**
 * A deployment's own sign-in over the identity store: one account per address, every method a
 * credential on it, and the payload always the deployment's OWN app's row in the person's main
 * organization — never a row another app wrote for the same person.
 */
describe('linkProfile', () => {
  test('a first sign-in registers an organization, an account, the credential and the owner row', async () => {
    const { linking, stores } = await makeIdentityContext({ service: 'viable' })

    const payload = await linking.linkProfile(details('google-oauth', 'google-sub', 'google'), { username: 'person@example.org' })

    const [account] = stores.accounts.rows
    const [entity] = stores.entities.rows
    expect(stores.entities.rows).toHaveLength(1)
    expect(stores.accounts.rows).toHaveLength(1)
    expect(stores.profiles.rows).toHaveLength(1)
    expect(stores.profiles.rows[0]).toMatchObject({
      profileId: identityKeyHelper.profileIdOf('viable', account!.id), userId: account!.id, service: 'viable', entityId: entity!.id,
      owner: true, role: AuthRole.User, scopes: ['*'], permissions: [],
    })
    expect(stores.profiles.rows[0]!.credential).toBeUndefined()
    expect(stores.credentials.rows).toEqual([expect.objectContaining({
      type: 'google-oauth', userId: 'google-oauth:google:google-sub', credential: 'service:google-oauth:google', accountId: account!.id,
    })])
    expect(payload).toEqual({
      type: 'google-oauth', role: AuthRole.User, userId: account!.id, profileId: identityKeyHelper.profileIdOf('viable', account!.id),
      entitySlug: entity!.slug, scopes: ['*'],
    })
  })

  test('a SECOND method on the same address adds a credential, not an identity', async () => {
    const { linking, stores } = await makeIdentityContext()

    const first = await linking.linkProfile(details('google-oauth', 'google-sub'), { username: 'person@example.org' })
    const second = await linking.linkProfile(
      details(AuthenticationType.Supervisor, 'person@example.org'), { username: 'Person@Example.org' }
    )

    expect(stores.entities.rows).toHaveLength(1)
    expect(stores.accounts.rows).toHaveLength(1)
    expect(stores.profiles.rows).toHaveLength(1)
    expect(stores.credentials.rows.map(row => row.type).sort()).toEqual(['google-oauth', AuthenticationType.Supervisor].sort())
    expect(second.profileId).toBe(first.profileId)
    expect(second.entitySlug).toBe(first.entitySlug)
    expect(await linking.getLinkedProfile(details(AuthenticationType.Supervisor, 'person@example.org'))).toEqual(second)
  })

  test('a different address is a different person', async () => {
    const { linking, stores } = await makeIdentityContext()

    await linking.linkProfile(details('google-oauth', 'a'), { username: 'a@example.org' })
    await linking.linkProfile(details('google-oauth', 'b'), { username: 'b@example.org' })

    expect(stores.entities.rows).toHaveLength(2)
    expect(stores.profiles.rows).toHaveLength(2)
  })

  test("another app's row of the same person is never the answer — the own app's row is ensured", async () => {
    const { ctx, linking, stores } = await makeIdentityContext({ service: 'viable' })
    // The person first registered at a target app, with an e-mail code.
    const { account } = await identityOf(ctx).ensureAccount({ email: 'person@example.org' }, details('email-otp', 'person@example.org', 'email'))
    const target = await identityOf(ctx).ensureProfile({ account, service: 'shop-taskly', entityId: account.entityId, owner: true })

    // The target's method is linked to the account, but this app has no row yet: not linked here.
    expect(await linking.getLinkedProfile(details('email-otp', 'person@example.org', 'email'))).toBeNull()

    const payload = await linking.linkProfile(details('google-oauth', 'sub'), { username: 'person@example.org' })

    expect(payload.profileId).toBe(identityKeyHelper.profileIdOf('viable', account.id))
    expect(payload.profileId).not.toBe(target.profileId)
    expect(stores.accounts.rows).toHaveLength(1)
    expect(stores.entities.rows).toHaveLength(1)
    expect(stores.profiles.rows.map(row => row.service).sort()).toEqual(['shop-taskly', 'viable'])
    expect(stores.profiles.rows.find(row => row.service === 'shop-taskly')!.scopes).toEqual([])
  })

  test('the package default app key is used when the deployment passes none', async () => {
    const { linking } = await makeIdentityContext()

    const payload = await linking.linkProfile(details('google-oauth', 'sub'), { username: 'person@example.org' })

    expect(payload.profileId).toStartWith(`${DEFAULT_APP_SERVICE}:`)
  })
})

describe('linkCredentials', () => {
  test('attaches a further method to the account of the named row', async () => {
    const { linking, stores } = await makeIdentityContext()
    const first = await linking.linkProfile(details('google-oauth', 'sub'), { username: 'person@example.org' })

    const linked = await linking.linkCredentials({ ...details('github', 'gh-sub'), profileId: first.profileId })

    expect(linked).toEqual({ ...first, type: 'github' })
    expect(stores.credentials.rows.map(row => row.accountId)).toEqual([first.userId, first.userId])
  })

  test('refuses a method that signs into another account', async () => {
    const { linking } = await makeIdentityContext()
    const first = await linking.linkProfile(details('google-oauth', 'a'), { username: 'a@example.org' })
    await linking.linkProfile(details('google-oauth', 'b'), { username: 'b@example.org' })

    await expect(linking.linkCredentials({ ...details('google-oauth', 'b'), profileId: first.profileId }))
      .rejects.toThrow('another account')
  })
})

describe('unlinkCredentials', () => {
  test('the stored mapping is removed, and only that one', async () => {
    const { linking, stores } = await makeIdentityContext()
    await linking.linkProfile(details('email-otp', 'sub-1'), { username: 'person@example.org' })
    await linking.linkProfile(details('google', 'sub-2'), { username: 'person@example.org' })
    expect(stores.credentials.rows).toHaveLength(2)

    await linking.unlinkCredentials(details('email-otp', 'sub-1'))

    expect(stores.credentials.rows.map(row => row.type)).toEqual(['google'])
    expect(await linking.getLinkedProfile(details('email-otp', 'sub-1'))).toBeNull()
    expect(await linking.getLinkedProfile(details('google', 'sub-2'))).not.toBeNull()
  })

  test('a login that maps to nothing is already in the state this promises', async () => {
    const { linking } = await makeIdentityContext()

    expect(await linking.unlinkCredentials(details('email-otp', 'nobody'))).toBeUndefined()
  })
})

describe('owner reads', () => {
  test('getOwnerProfiles lists the own app\'s rows of the organization, whatever their number', async () => {
    const { ctx, linking, stores } = await makeIdentityContext({ service: 'viable' })
    const owner = await linking.linkProfile(details('google-oauth', 'owner'), { username: 'owner@example.org' })
    const entityId = stores.entities.rows[0]!.id
    // A member of the same organization, and the owner's row of another app there.
    const { account: member } = await identityOf(ctx).ensureAccount({ email: 'member@example.org' })
    await identityOf(ctx).ensureProfile({ account: member, service: 'viable', entityId, scopes: ['*'] })
    await identityOf(ctx).ensureProfile({ account: stores.accounts.rows[0] as never, service: 'shop-taskly', entityId })

    const profiles = await linking.getOwnerProfiles(entityId)

    expect(profiles.map(profile => profile.id).sort()).toEqual([owner.profileId!, identityKeyHelper.profileIdOf('viable', member.id)].sort())
    expect(profiles.every(profile => profile.entitySlug === owner.entitySlug)).toBe(true)
  })

  test('getOwnerCredentials answers a method of the account as its own-app row', async () => {
    const { linking } = await makeIdentityContext()
    const owner = await linking.linkProfile(details('google-oauth', 'owner'), { username: 'owner@example.org' })

    const credentials = await linking.getOwnerCredentials(owner.userId, undefined, 'google-oauth')

    expect(credentials).toMatchObject({
      type: 'google-oauth', userId: owner.userId, profileId: owner.profileId, entitySlug: owner.entitySlug,
      credential: 'service:google-oauth:google-oauth', challenge: '',
    })
    expect(await linking.getOwnerCredentials(owner.userId, undefined, 'github')).toBeUndefined()
    expect(await linking.getOwnerCredentials('not-an-account')).toBeUndefined()
  })
})
