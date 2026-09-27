import { describe, expect, test } from 'bun:test'
import { AuthenticationType } from '@owlmeans/auth'
import type { EntityCreatedEvent } from '../src/types.js'
import { identityEvents } from '../src/events.js'
import { AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_ORG_ENTITY } from '../src/consts.js'
import { details, eventsOf, linkingFor, makeCtx } from './context.js'

/**
 * The organization entity is announced exactly when one is created — on a registration, never on
 * a second sign-in method that links to an identity the platform already has. An application
 * provisions on it (a starting plan, say), so a missed or doubled event is a missed or doubled
 * provisioning, and a listener's failure must not become a login failure.
 */
describe('identity events', () => {
  test('a registration announces the entity it created, once', async () => {
    const ctx = makeCtx({ events: true })
    const received: EntityCreatedEvent[] = []
    eventsOf(ctx).onEntityCreated(async event => { received.push(event) })

    const payload = await linkingFor(ctx).linkProfile(
      details('google-oauth', 'google-sub') as never, { username: 'person@example.org' }
    )

    const [entity] = ctx.resources[AUTH_IDENTITY_ORG_ENTITY].items
    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({
      entityId: entity.id,
      entitySlug: entity.slug,
      iamKey: entity.iamKey,
      profileId: payload.profileId,
      username: 'person@example.org',
      type: 'google-oauth',
      service: 'google-oauth',
    })
    expect(received[0].accountId).toBe(ctx.resources[AUTH_IDENTITY_ACCOUNT].items[0].id)
    expect(received[0].createdAt).toBeInstanceOf(Date)
  })

  test('a second sign-in method links and announces nothing', async () => {
    const ctx = makeCtx({ events: true })
    const received: EntityCreatedEvent[] = []
    eventsOf(ctx).onEntityCreated(async event => { received.push(event) })
    const linking = linkingFor(ctx)

    await linking.linkProfile(details('google-oauth', 'google-sub') as never, { username: 'person@example.org' })
    await linking.linkProfile(
      details(AuthenticationType.Supervisor, 'person@example.org') as never, { username: 'person@example.org' }
    )
    expect(received).toHaveLength(1)

    await linking.linkProfile(
      details('google-oauth', 'other-sub') as never, { username: 'person@example.org', force: true }
    )
    expect(received).toHaveLength(2)
    expect(received[1].entityId).not.toBe(received[0].entityId)
  })

  test('a throwing listener neither fails the sign-in nor silences the next one', async () => {
    const ctx = makeCtx({ events: true })
    const reached: string[] = []
    eventsOf(ctx).onEntityCreated(async () => { throw new Error('provisioning is down') })
    eventsOf(ctx).onEntityCreated(async event => { reached.push(event.entityId) })

    const payload = await linkingFor(ctx).linkProfile(
      details('google-oauth', 'google-sub') as never, { username: 'person@example.org' }
    )

    expect(payload.profileId).toStartWith('google-oauth:')
    expect(reached).toHaveLength(1)
  })

  test('without the service registered there is nothing to announce to', async () => {
    const ctx = makeCtx()

    expect(identityEvents(ctx as never)).toBeNull()
    const payload = await linkingFor(ctx).linkProfile(
      details('google-oauth', 'google-sub') as never, { username: 'person@example.org' }
    )
    expect(payload.profileId).toStartWith('google-oauth:')
  })
})
