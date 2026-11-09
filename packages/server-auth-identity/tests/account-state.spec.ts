import { describe, expect, test } from 'bun:test'
import { AuthenFailed, AuthRefused } from '@owlmeans/auth'
import { accountStateOf } from '../src/account-state.js'
import { identityOf } from '../src/identity.js'
import { IDENTITY_ACCOUNT_DISABLED, IDENTITY_PROFILE_DISABLED } from '../src/consts.js'
import type { IdentityAccount, IdentityProfile } from '../src/types.js'
import { details, makeIdentityContext } from './context.js'

type Rec = Record<string, any>

/** A person signed in to the own app (`viable`) once, through Google. */
const signedUp = async (email: string = 'person@example.org') => {
  const harness = await makeIdentityContext({ service: 'viable' })
  const payload = await harness.linking.linkProfile(details('google-oauth', `sub:${email}`, 'google'), { username: email })
  const account = harness.stores.accounts.rows.find(row => row.email === email) as Rec
  const row = (service: string, entityId: string = account.entityId): Rec | undefined =>
    harness.stores.profiles.rows.find(item => item.service === service && item.entityId === entityId)

  return { ...harness, payload, account, row }
}

describe('accountStateOf(ctx).setDisabled / isDisabled', () => {
  test('a ban writes `disabled` and `disabledAt` only; a repeated ban keeps when it began', async () => {
    const { ctx, account, stores } = await signedUp()
    const before = structuredClone(account)
    const state = accountStateOf(ctx)

    expect(await state.isDisabled(account.id)).toBe(false)
    expect(await state.setDisabled(account.id, true)).toBe(true)

    const banned = stores.accounts.rows[0]!
    expect(banned).toEqual({ ...before, disabled: true, disabledAt: expect.any(Date) })
    expect(await state.isDisabled(account.id)).toBe(true)

    const since = banned.disabledAt as Date
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(await state.setDisabled(account.id, true)).toBe(true)
    expect(stores.accounts.rows[0]!.disabledAt).toEqual(since)
  })

  test('lifting the ban sets `disabled: false` and drops `disabledAt`', async () => {
    const { ctx, account, stores } = await signedUp()
    const before = structuredClone(account)
    const state = accountStateOf(ctx)
    await state.setDisabled(account.id, true)

    expect(await state.setDisabled(account.id, false)).toBe(true)

    expect(stores.accounts.rows[0]).toEqual({ ...before, disabled: false })
    expect(await state.isDisabled(account.id)).toBe(false)
  })

  test('an unknown account is neither banned nor bannable', async () => {
    const { ctx, stores } = await signedUp()
    const state = accountStateOf(ctx)
    const unknown = '0123456789abcdef01234567'

    expect(await state.setDisabled(unknown, true)).toBe(false)
    expect(await state.setDisabled(unknown, false)).toBe(false)
    expect(await state.isDisabled(unknown)).toBe(false)
    // A missing id addresses nobody — never the first account a bare filter would match.
    expect(await state.setDisabled(undefined as never, true)).toBe(false)
    expect(await state.setDisabled('', true)).toBe(false)
    expect(await state.isDisabled(undefined as never)).toBe(false)
    expect(stores.accounts.rows.every(row => row.disabled == null)).toBe(true)
  })
})

describe('accountStateOf(ctx).touchSignIn', () => {
  test('stamps the account and the one row signed into, nothing else', async () => {
    const { ctx, account, row, stores } = await signedUp()
    // The same person's row of the own app in another organization, and their row of a target app.
    const { account: other } = await identityOf(ctx).ensureAccount({ email: 'other@example.org' })
    await identityOf(ctx).ensureProfile({ account: account as IdentityAccount, service: 'viable', entityId: other.entityId })
    await identityOf(ctx).ensureProfile({ account: account as IdentityAccount, service: 'shop-taskly', entityId: account.entityId })
    const primary = row('viable')!
    const untouched = stores.profiles.rows.filter(item => item !== primary).map(item => structuredClone(item))

    const at = await accountStateOf(ctx).touchSignIn({
      accountId: account.id, profileId: primary.profileId, entityId: account.entityId,
    })

    expect(at).toBeInstanceOf(Date)
    expect(stores.accounts.rows.find(item => item.id === account.id)!.signedInAt).toEqual(at)
    expect(stores.accounts.rows.find(item => item.id === other.id)!.signedInAt).toBeUndefined()
    expect(row('viable')!.signedInAt).toEqual(at)
    expect(stores.profiles.rows.filter(item => item.id !== primary.id)).toEqual(untouched)
  })

  test("a row is stamped only under its own account, and only by its full key", async () => {
    const { ctx, account, row, stores } = await signedUp()
    const { account: stranger } = await identityOf(ctx).ensureAccount({ email: 'stranger@example.org' })

    await accountStateOf(ctx).touchSignIn({
      accountId: stranger.id, profileId: row('viable')!.profileId, entityId: account.entityId,
    })

    expect(row('viable')!.signedInAt).toBeUndefined()
    await expect(accountStateOf(ctx).touchSignIn({ accountId: account.id, profileId: undefined as never, entityId: account.entityId }))
      .rejects.toThrow('identity:sign-in-touch')
    expect(stores.profiles.rows.every(item => item.signedInAt == null)).toBe(true)
  })
})

describe('accountStateOf(ctx).refusalOf', () => {
  test('a ban refuses every row of the account; a lift admits them again', async () => {
    const { ctx, account, row } = await signedUp()
    const state = accountStateOf(ctx)
    const primary = row('viable') as IdentityProfile

    expect(await state.refusalOf(primary)).toBeNull()
    await state.setDisabled(account.id, true)
    expect(await state.refusalOf(primary)).toBe(IDENTITY_ACCOUNT_DISABLED)
    await state.setDisabled(account.id, false)
    expect(await state.refusalOf(primary)).toBeNull()
  })

  test("a disabled PRIMARY row refuses the app's rows in every organization, not another app's", async () => {
    const { ctx, account, row } = await signedUp()
    const { account: other } = await identityOf(ctx).ensureAccount({ email: 'other@example.org' })
    const member = await identityOf(ctx).ensureProfile({ account: account as IdentityAccount, service: 'viable', entityId: other.entityId })
    const target = await identityOf(ctx).ensureProfile({ account: account as IdentityAccount, service: 'shop-taskly', entityId: account.entityId })
    row('viable')!.disabled = true

    const state = accountStateOf(ctx)
    expect(await state.refusalOf(row('viable') as IdentityProfile)).toBe(IDENTITY_PROFILE_DISABLED)
    expect(await state.refusalOf(member)).toBe(IDENTITY_PROFILE_DISABLED)
    expect(await state.refusalOf(target)).toBeNull()
  })

  test('a disabled membership row that is not the primary one refuses nothing here', async () => {
    const { ctx, account } = await signedUp()
    const { account: other } = await identityOf(ctx).ensureAccount({ email: 'other@example.org' })
    const member = await identityOf(ctx).ensureProfile({ account: account as IdentityAccount, service: 'viable', entityId: other.entityId })

    expect(await accountStateOf(ctx).refusalOf({ ...member, disabled: true })).toBeNull()
  })
})

describe('registration stamps', () => {
  test('a new account carries `createdAt`; a known one is returned as stored', async () => {
    const { ctx, account, stores } = await signedUp()
    expect(account.createdAt).toBeInstanceOf(Date)

    // An account registered before the stamp existed.
    delete stores.accounts.rows[0]!.createdAt
    const { account: known } = await identityOf(ctx).ensureAccount({ email: 'person@example.org' })

    expect(known.createdAt).toBeUndefined()
    expect(stores.accounts.rows[0]!.createdAt).toBeUndefined()
  })
})

/**
 * The deployment's own sign-in refuses a banned account and a disabled primary row of its own app —
 * through every linking member — while an unknown login still answers null and registers.
 */
describe('linking refusals', () => {
  test('getLinkedProfile refuses a banned account and a disabled own-app primary row', async () => {
    const { ctx, account, linking, row } = await signedUp()
    const google = details('google-oauth', 'sub:person@example.org', 'google')

    await accountStateOf(ctx).setDisabled(account.id, true)
    await expect(linking.getLinkedProfile(google)).rejects.toBeInstanceOf(AuthenFailed)
    await expect(linking.getLinkedProfile(google)).rejects.toThrow(`authen:${IDENTITY_ACCOUNT_DISABLED}`)

    await accountStateOf(ctx).setDisabled(account.id, false)
    row('viable')!.disabled = true
    await expect(linking.getLinkedProfile(google)).rejects.toThrow(`authen:${IDENTITY_PROFILE_DISABLED}`)
    // A refusal, not a fault: the class answers 403 with the access-denied marker on the wire.
    await expect(linking.getLinkedProfile(google)).rejects.toBeInstanceOf(AuthRefused)

    row('viable')!.disabled = false
    expect(await linking.getLinkedProfile(google)).toMatchObject({ userId: account.id })
    expect(await linking.getLinkedProfile(details('google-oauth', 'nobody', 'google'))).toBeNull()
  })

  test('linkProfile refuses a banned person before writing the own-app row', async () => {
    const { ctx, linking, stores } = await makeIdentityContext({ service: 'viable' })
    // Known from a target app only.
    const { account } = await identityOf(ctx).ensureAccount({ email: 'person@example.org' }, details('email-otp', 'person@example.org', 'email'))
    await identityOf(ctx).ensureProfile({ account, service: 'shop-taskly', entityId: account.entityId, owner: true })
    await accountStateOf(ctx).setDisabled(account.id, true)

    await expect(linking.linkProfile(details('google-oauth', 'sub', 'google'), { username: 'person@example.org' }))
      .rejects.toThrow(`authen:${IDENTITY_ACCOUNT_DISABLED}`)
    await expect(linking.linkProfile(details('google-oauth', 'sub', 'google'), { username: 'person@example.org' }))
      .rejects.toBeInstanceOf(AuthRefused)

    expect(stores.profiles.rows.map(item => item.service)).toEqual(['shop-taskly'])
    expect(stores.accounts.rows).toHaveLength(1)
  })

  test('linkProfile refuses a disabled own-app primary row and leaves it disabled', async () => {
    const { linking, row } = await signedUp()
    row('viable')!.disabled = true

    await expect(linking.linkProfile(details('github', 'gh-sub'), { username: 'person@example.org' }))
      .rejects.toThrow(`authen:${IDENTITY_PROFILE_DISABLED}`)
    await expect(linking.linkProfile(details('github', 'gh-sub'), { username: 'person@example.org' }))
      .rejects.toBeInstanceOf(AuthRefused)
    expect(row('viable')!.disabled).toBe(true)
  })

  test("a disabled row of another app never refuses the own app's sign-in", async () => {
    const { ctx, account, linking, payload, row } = await signedUp()
    await identityOf(ctx).ensureProfile({ account: account as IdentityAccount, service: 'shop-taskly', entityId: account.entityId })
    row('shop-taskly')!.disabled = true

    expect(await linking.getLinkedProfile(details('google-oauth', 'sub:person@example.org', 'google'))).toEqual(payload)
  })

  test('linkCredentials refuses before attaching the method', async () => {
    const { ctx, account, linking, payload, stores } = await signedUp()
    await accountStateOf(ctx).setDisabled(account.id, true)

    await expect(linking.linkCredentials({ ...details('github', 'gh-sub'), profileId: payload.profileId }))
      .rejects.toThrow(`authen:${IDENTITY_ACCOUNT_DISABLED}`)
    expect(stores.credentials.rows.map(item => item.type)).toEqual(['google-oauth'])
  })
})
