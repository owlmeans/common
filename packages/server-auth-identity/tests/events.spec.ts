import { describe, expect, test } from 'bun:test'
import { addLogPlugin, memoryPlugin, removeLogPlugin } from '@owlmeans/log'
import { AuthenticationType } from '@owlmeans/auth'
import { makeServerContext, config as serverConfig } from '@owlmeans/server-context'
import type { ServerConfig } from '@owlmeans/server-context'
import { identityEvents } from '../src/events.js'
import { identityOf } from '../src/identity.js'
import { identityKeyHelper } from '../src/keys.js'
import { details, makeIdentityContext } from './context.js'

/**
 * The organization is announced exactly when a registration completes (account, personal
 * organization, owner row); a person's becoming a user of an app exactly when the primary row of
 * that (account, app) is created. An application provisions on them (a starting plan, say), so a
 * missed or doubled event is a missed or doubled provisioning, and a listener's failure must not
 * become a login failure.
 */
describe('identity events', () => {
  test('a registration announces the entity it created and the app the owner row belongs to, once', async () => {
    const { linking, stores, entityCreated, profileCreated } = await makeIdentityContext({ service: 'viable' })

    const payload = await linking.linkProfile(details('google-oauth', 'google-sub', 'google'), { username: 'person@example.org' })

    const [entity] = stores.entities.rows
    const [account] = stores.accounts.rows
    expect(entityCreated).toHaveLength(1)
    expect(entityCreated[0]).toMatchObject({
      entityId: entity!.id, entitySlug: entity!.slug, iamKey: entity!.iamKey, accountId: account!.id,
      profileId: payload.profileId, username: 'person@example.org', type: 'google-oauth', service: 'google',
      profileService: 'viable',
    })
    expect(entityCreated[0]!.createdAt).toBeInstanceOf(Date)
    expect(profileCreated).toEqual([{
      entityId: entity!.id, entitySlug: entity!.slug, accountId: account!.id,
      profileId: identityKeyHelper.profileIdOf('viable', account!.id), service: 'viable', owner: true,
    }])
  })

  test('a second sign-in method links and announces nothing', async () => {
    const { linking, entityCreated, profileCreated } = await makeIdentityContext()

    await linking.linkProfile(details('google-oauth', 'google-sub'), { username: 'person@example.org' })
    await linking.linkProfile(details(AuthenticationType.Supervisor, 'person@example.org'), { username: 'person@example.org' })

    expect(entityCreated).toHaveLength(1)
    expect(profileCreated).toHaveLength(1)
  })

  test('a person known from another app becomes a user of this one without a new organization', async () => {
    const { ctx, linking, entityCreated, profileCreated } = await makeIdentityContext({ service: 'viable' })
    const { account } = await identityOf(ctx).ensureAccount({ email: 'person@example.org' })
    await identityOf(ctx).ensureProfile({ account, service: 'shop-taskly', entityId: account.entityId, owner: true })

    await linking.linkProfile(details('google-oauth', 'sub'), { username: 'person@example.org' })

    expect(entityCreated).toHaveLength(0)
    expect(profileCreated.map(event => event.service)).toEqual(['shop-taskly', 'viable'])
    expect(profileCreated.every(event => event.entityId === account.entityId)).toBe(true)
  })

  test('a throwing listener neither fails the sign-in nor silences the next one', async () => {
    const { linking, events } = await makeIdentityContext()
    const reached: string[] = []
    events.onEntityCreated(async () => { throw new Error('provisioning is down') })
    events.onEntityCreated(async event => { reached.push(event.entityId) })
    events.onProfileCreated(async () => { throw new Error('plans are down') })
    events.onProfileCreated(async event => { reached.push(event.profileId) })
    const memory = memoryPlugin('identity-events')
    addLogPlugin(memory)

    try {
      const payload = await linking.linkProfile(details('google-oauth', 'google-sub'), { username: 'person@example.org' })

      expect(payload.profileId).toStartWith('app:')
      expect(reached).toHaveLength(2)
      // Each failed listener is logged, with its error, rather than failing the sign-in.
      const failed = memory.records.filter(record => record.level === 'error' && record.scope === 'server-auth-identity')
      expect(failed.map(record => record.error?.message).sort()).toEqual(['plans are down', 'provisioning is down'])
    } finally {
      removeLogPlugin('identity-events')
    }
  })

  test('without the service registered there is nothing to announce to', () => {
    const ctx = makeServerContext(serverConfig<ServerConfig>('bare'))

    expect(identityEvents(ctx)).toBeNull()
  })
})
