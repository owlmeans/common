import { describe, expect, test } from 'bun:test'
import { ENTITY_RESOLVER } from '@owlmeans/auth-common'
import type { EntityResolverService } from '@owlmeans/auth-common'
import { ensureAccount } from '../src/identity.js'
import { listOrgGroups, putOrgGroup, removeOrgGroup } from '../src/groups.js'
import type { OrgGroup } from '../src/types.js'
import { makeIdentityContext } from './context.js'

const group = (service: string, key: string, title?: string): OrgGroup => ({
  service, key, permissions: [], ...(title != null ? { title } : {}),
})

/**
 * Every writer of an organization changes it field by field. A whole-record write from a stale read
 * would erase what another writer added since — an app's groups, a minted name — so the memory
 * store refuses whole-record updates outright, and these pass only through the field-level path.
 */
const organization = async () => {
  const harness = await makeIdentityContext()
  const { account } = await ensureAccount(harness.ctx, { email: 'owner@example.org' })
  const resolver = harness.ctx.service<EntityResolverService>(ENTITY_RESOLVER)

  return { ...harness, entityId: account.entityId, resolver, row: () => harness.stores.entities.rows[0]! }
}

describe('entity resolver — field-level writes', () => {
  test('rename keeps the groups and names, retires the old slug, and resolves both', async () => {
    const { ctx, entityId, resolver, row } = await organization()
    await putOrgGroup(ctx, entityId, group('shop-taskly', 'members'))
    await resolver.mintName(entityId, 'namespace', entity => `ns-${entity.iamKey}`)
    const before = row().slug

    const renamed = await resolver.rename(entityId, 'acme-works')

    expect(renamed).toMatchObject({ id: entityId, slug: 'acme-works', formerSlugs: [before] })
    expect(row().groups).toEqual([group('shop-taskly', 'members')])
    expect(row().names.namespace).toBe(`ns-${row().iamKey}`)
    expect((await resolver.resolve(before))?.id).toBe(entityId)
    expect((await resolver.resolve('acme-works'))?.id).toBe(entityId)
  })

  test('a renamed-back slug leaves the former list, and a taken one is refused', async () => {
    const { ctx, entityId, resolver } = await organization()
    const original = (await resolver.byId(entityId))!.slug
    await resolver.rename(entityId, 'acme-works')
    const back = await resolver.rename(entityId, original)
    expect(back.formerSlugs).toEqual(['acme-works'])

    const { account } = await ensureAccount(ctx, { email: 'other@example.org' })
    await expect(resolver.rename(account.entityId, 'acme-works')).rejects.toThrow('entity:slug-taken:acme-works')
  })

  test('mintName freezes the first name and keeps the groups', async () => {
    const { ctx, entityId, resolver, row } = await organization()
    await putOrgGroup(ctx, entityId, group('shop-taskly', 'members'))

    const [first, second] = await Promise.all([
      resolver.mintName(entityId, 'realm', () => 'realm-one'),
      resolver.mintName(entityId, 'realm', () => 'realm-two'),
    ])

    expect(first).toBe(second)
    expect(row().names.realm).toBe(first)
    expect(await resolver.mintName(entityId, 'realm', () => 'realm-three')).toBe(first)
    expect(row().groups).toHaveLength(1)
    await expect(resolver.mintName(entityId, 'a.b', () => 'x')).rejects.toThrow('entity:name-key-malformed')
  })

  test('the cache keeps the slim reference only', async () => {
    const { ctx, entityId, resolver } = await organization()
    await putOrgGroup(ctx, entityId, group('shop-taskly', 'members'))

    const ref = await resolver.resolve(entityId)

    expect(Object.keys(ref!).sort()).toEqual(['formerSlugs', 'iamKey', 'id', 'slug'])
  })
})

describe('organization groups', () => {
  test('unique per (service, key): a second put replaces, another app or key is its own group', async () => {
    const { ctx, entityId, row } = await organization()

    await putOrgGroup(ctx, entityId, group('shop-taskly', 'members', 'Staff'))
    await putOrgGroup(ctx, entityId, group('shop-taskly', 'members', 'Everyone'))
    await putOrgGroup(ctx, entityId, group('shop-taskly', 'editors'))
    await putOrgGroup(ctx, entityId, group('shop-other', 'members'))

    expect(row().groups).toEqual([
      group('shop-taskly', 'members', 'Everyone'), group('shop-taskly', 'editors'), group('shop-other', 'members'),
    ])
    expect((await listOrgGroups(ctx, entityId, 'shop-taskly')).map(item => item.key)).toEqual(['members', 'editors'])
  })

  test('concurrent puts of one pair leave exactly one group', async () => {
    const { ctx, entityId, row } = await organization()

    await Promise.all(['A', 'B', 'C', 'D'].map(title => putOrgGroup(ctx, entityId, group('shop-taskly', 'members', title))))

    expect(row().groups.filter((item: OrgGroup) => item.service === 'shop-taskly' && item.key === 'members')).toHaveLength(1)
  })

  test('remove pulls only that group; an unknown organization is refused', async () => {
    const { ctx, entityId, row } = await organization()
    await putOrgGroup(ctx, entityId, group('shop-taskly', 'members'))
    await putOrgGroup(ctx, entityId, group('shop-other', 'members'))

    expect(await removeOrgGroup(ctx, entityId, 'shop-taskly', 'members')).toBe(true)
    expect(await removeOrgGroup(ctx, entityId, 'shop-taskly', 'members')).toBe(false)
    expect(row().groups).toEqual([group('shop-other', 'members')])
    await expect(putOrgGroup(ctx, '6a947ad8d91016d23f4bc972', group('shop-taskly', 'members'))).rejects.toThrow()
  })
})
