import { describe, expect, test } from 'bun:test'
import { AuthRole } from '@owlmeans/auth'
import { AuthenticationType } from '@owlmeans/auth'
import { makeIdentityLinkingService } from '../src/service.js'
import {
  AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_CREDENTIALS, AUTH_IDENTITY_ORG_ENTITY,
  AUTH_IDENTITY_PROFILE,
} from '../src/consts.js'
import { ENTITY_RESOLVER } from '@owlmeans/auth-common'

/**
 * One human, one email, one platform profile — whichever way they sign in.
 *
 * `linkProfile` used to create an organization, an account and a profile on every registration,
 * and registration is per METHOD. The same address signing in by Google and then by key ended up
 * in two entities that could not see each other's projects: `requireEntity` matched neither, and
 * ownership (`project.createdBy`) named a profile the other identity did not have.
 *
 * The rows are stubbed rather than mocked — the service's whole behaviour here is which record it
 * reads before it writes, so a stub that records writes is the subject, not a stand-in for it.
 */
const stubResource = <T extends { id?: string }>(alias: string, seed: T[] = []) => {
  const items: T[] = [...seed]
  let next = seed.length + 1

  const matches = (record: any, where: any): boolean =>
    where == null || Object.entries(where).every(([key, value]) => record[key] === value)

  return {
    alias,
    items,
    list: async (where?: unknown) => ({ items: items.filter(item => matches(item, where)) }),
    load: async (where?: unknown) => items.find(item => matches(item, where)) ?? null,
    get: async (where?: unknown) => {
      const found = items.find(item => matches(item, where))
      if (found == null) throw new Error(`${alias}: not found`)
      return found
    },
    create: async (record: T) => {
      const stored = { ...record, id: record.id ?? `${alias}-${next++}` } as T
      items.push(stored)
      return stored
    },
    registerContext: () => undefined,
  }
}

const makeCtx = (seed: {
  accounts?: any[], profiles?: any[], credentials?: any[]
} = {}) => {
  const resources: Record<string, any> = {
    [AUTH_IDENTITY_ACCOUNT]: stubResource('account', seed.accounts),
    [AUTH_IDENTITY_PROFILE]: stubResource('profile', seed.profiles),
    [AUTH_IDENTITY_CREDENTIALS]: stubResource('credential', seed.credentials),
    [AUTH_IDENTITY_ORG_ENTITY]: stubResource('entity'),
  }
  let minted = 0

  return {
    resources,
    resource: (alias: string) => resources[alias],
    service: (alias: string) => {
      if (alias !== ENTITY_RESOLVER) throw new Error(`unexpected service ${alias}`)
      return {
        mintSlug: async () => `slug-${++minted}`,
        byId: async (id: string) => ({ id, slug: `slug-of-${id}` }),
      }
    },
  }
}

const details = (type: string, sub: string) => ({
  type, service: type, clientId: type, userId: sub, username: 'person@example.org',
})

const linkingFor = (ctx: unknown) => {
  const service = makeIdentityLinkingService()
  service.registerContext(ctx as never)
  return service
}

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
