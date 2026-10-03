import { describe, expect, test } from 'bun:test'
import { AuthenticationType } from '@owlmeans/auth'
import { ensureAccount, ensureProfile, profileIdOf } from '../src/identity.js'
import { DEFAULT_APP_SERVICE } from '../src/consts.js'
import { details, makeIdentityContext } from './context.js'

const ACCOUNT_ID = '6a947ad8d91016d23f4bc972'

/**
 * One person is one account, whichever way and wherever they sign in: a sign-in method is a
 * credential on the account, an app is a row of its own, and the organization they own is created
 * with the account.
 */
describe('profileIdOf', () => {
  test('is computed — the same for one (account, app), different across apps and accounts', () => {
    const viable = profileIdOf('viable', ACCOUNT_ID)

    expect(profileIdOf('viable', ACCOUNT_ID)).toBe(viable)
    expect(viable).toMatch(/^viable:[1-9A-HJ-NP-Za-km-z]{22}$/)
    expect(profileIdOf('shop-taskly', ACCOUNT_ID)).not.toBe(viable)
    expect(profileIdOf('viable', '6a947ad8d91016d23f4bc973')).not.toBe(viable)
    // The account's record id never reaches the wire through it.
    expect(viable).not.toContain(ACCOUNT_ID)
  })
})

describe('ensureAccount', () => {
  test('one account per address across Google, a supervisor key and an e-mail code', async () => {
    const { ctx, stores } = await makeIdentityContext()

    const google = await ensureAccount(ctx, { email: 'Person@Example.org ', name: 'Person' }, details('google-oauth', 'google-sub', 'google'))
    const supervisor = await ensureAccount(ctx, { email: 'person@example.org' }, details(AuthenticationType.Supervisor, 'person@example.org', 'supervisor'))
    const code = await ensureAccount(ctx, { email: 'PERSON@example.org' }, details('email-otp', 'person@example.org', 'email'))

    expect(stores.accounts.rows).toHaveLength(1)
    expect(stores.entities.rows).toHaveLength(1)
    expect(supervisor.account.id).toBe(google.account.id)
    expect(code.account.id).toBe(google.account.id)
    expect(google.account).toMatchObject({ email: 'person@example.org', name: 'Person', scopes: [] })
    // Only the first call registered anybody; its organization is the account's main one.
    expect(google.registered?.id).toBe(google.account.entityId)
    expect(supervisor.registered).toBeUndefined()
    expect(code.registered).toBeUndefined()
    // Every method is a credential ON THE ACCOUNT; no profile row was written by any of them.
    expect(stores.credentials.rows.map(row => [row.type, row.accountId]).sort()).toEqual([
      [AuthenticationType.Supervisor, google.account.id], ['email-otp', google.account.id], ['google-oauth', google.account.id],
    ].sort())
    expect(stores.profiles.rows).toHaveLength(0)
  })

  test('a returning method is found by its credential, whatever address it arrives with', async () => {
    const { ctx, stores } = await makeIdentityContext()
    const first = await ensureAccount(ctx, { email: 'person@example.org' }, details('google-oauth', 'sub'))

    const again = await ensureAccount(ctx, { email: 'renamed@example.org' }, details('google-oauth', 'sub'))

    expect(again.account.id).toBe(first.account.id)
    expect(stores.accounts.rows).toHaveLength(1)
    expect(stores.credentials.rows).toHaveLength(1)
  })

  test('two first sign-ins of one address racing yield ONE account and no orphan organization', async () => {
    const { ctx, stores } = await makeIdentityContext()

    const results = await Promise.all([
      ensureAccount(ctx, { email: 'race@example.org' }, details('google-oauth', 'sub-g')),
      ensureAccount(ctx, { email: 'race@example.org' }, details(AuthenticationType.Supervisor, 'race@example.org')),
      ensureAccount(ctx, { email: 'race@example.org' }),
    ])

    // The race really ran: every caller created an organization before the address was settled.
    expect(stores.entities.created).toBe(3)
    expect(stores.accounts.rows).toHaveLength(1)
    expect(stores.entities.rows).toHaveLength(1)
    expect(new Set(results.map(result => result.account.id)).size).toBe(1)
    expect(results.filter(result => result.registered != null)).toHaveLength(1)
    expect(results[0]!.account.entityId).toBe(stores.entities.rows[0]!.id)
    expect(stores.credentials.rows.every(row => row.accountId === results[0]!.account.id)).toBe(true)
  })

  test('an address is required', async () => {
    const { ctx } = await makeIdentityContext()

    await expect(ensureAccount(ctx, { email: '  ' })).rejects.toThrow('identity:email-missing')
  })
})

describe('ensureProfile', () => {
  test('a second app gets a second profile id, its primary row and its own announcement', async () => {
    const { ctx, stores, profileCreated } = await makeIdentityContext({ service: 'viable' })
    const { account } = await ensureAccount(ctx, { email: 'person@example.org' })

    const viable = await ensureProfile(ctx, { account, service: 'viable', entityId: account.entityId, owner: true, scopes: ['*'] })
    const target = await ensureProfile(ctx, { account, service: 'shop-taskly', entityId: account.entityId, owner: true })
    const again = await ensureProfile(ctx, { account, service: 'shop-taskly', entityId: account.entityId, owner: true })

    expect(target.profileId).not.toBe(viable.profileId)
    expect(target.profileId).toBe(profileIdOf('shop-taskly', account.id))
    expect(again.id).toBe(target.id)
    expect(stores.profiles.rows).toHaveLength(2)
    expect(target).toMatchObject({ service: 'shop-taskly', userId: account.id, entityId: account.entityId, owner: true, scopes: [], permissions: [] })
    expect(viable.scopes).toEqual(['*'])
    expect(profileCreated.map(event => event.service)).toEqual(['viable', 'shop-taskly'])
    expect(profileCreated[1]).toMatchObject({
      entityId: account.entityId, entitySlug: stores.entities.rows[0]!.slug, accountId: account.id,
      profileId: target.profileId, service: 'shop-taskly', owner: true,
    })
  })

  test('a row in another organization brings the primary row with it, announced once', async () => {
    const { ctx, stores, profileCreated } = await makeIdentityContext()
    const { account: owner } = await ensureAccount(ctx, { email: 'owner@example.org' })
    const { account: member } = await ensureAccount(ctx, { email: 'member@example.org' })

    const membership = await ensureProfile(ctx, {
      account: member, service: 'shop-taskly', entityId: owner.entityId, groups: ['members'], managed: true,
    })

    const rows = stores.profiles.rows.filter(row => row.userId === member.id)
    expect(rows).toHaveLength(2)
    const primary = rows.find(row => row.entityId === member.entityId)!
    expect(primary).toMatchObject({ profileId: membership.profileId, service: 'shop-taskly', owner: true })
    expect(primary.groups).toBeUndefined()
    expect(membership).toMatchObject({ entityId: owner.entityId, groups: ['members'], managed: true })
    expect(membership.owner).toBeUndefined()
    expect(profileCreated).toEqual([expect.objectContaining({
      entityId: member.entityId, accountId: member.id, service: 'shop-taskly', owner: true,
    })])

    // The pair already has its primary row: a further organization announces nothing.
    const { account: third } = await ensureAccount(ctx, { email: 'third@example.org' })
    await ensureProfile(ctx, { account: member, service: 'shop-taskly', entityId: third.entityId })
    expect(stores.profiles.rows.filter(row => row.userId === member.id)).toHaveLength(3)
    expect(profileCreated).toHaveLength(1)
  })

  test('two racing creates of one row leave one row and one announcement', async () => {
    const { ctx, stores, profileCreated } = await makeIdentityContext()
    const { account } = await ensureAccount(ctx, { email: 'person@example.org' })

    const rows = await Promise.all([1, 2, 3].map(() =>
      ensureProfile(ctx, { account, service: DEFAULT_APP_SERVICE, entityId: account.entityId, owner: true })))

    expect(stores.profiles.created).toBe(1)
    expect(new Set(rows.map(row => row.id)).size).toBe(1)
    expect(profileCreated).toHaveLength(1)
  })
})
