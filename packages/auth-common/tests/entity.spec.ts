import { describe, expect, test } from 'bun:test'
import { AppType, createService, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { AuthenFailed, AuthRole } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import type { AbstractRequest, ResolvedEntity } from '@owlmeans/entrypoint'
import { makeEntityScope } from '../src/entity.js'
import { ENTITY_RESOLVER } from '../src/consts.js'
import type { EntityResolverService, OrgEntityRef } from '../src/types.js'

const ACME: OrgEntityRef = { id: '0123456789abcdef01234567', slug: 'acme', formerSlugs: ['acme-old'], iamKey: 'acme-key' }

/** A context with an in-memory registry of one organization, or none at all. */
const contextWith = async (registry?: OrgEntityRef[]) => {
  const ctx = makeBasicContext<BasicConfig>({ ready: false, service: 'entity-tests', type: AppType.Backend })
  const calls: string[] = []
  if (registry != null) {
    ctx.registerService(createService<EntityResolverService>(ENTITY_RESOLVER, {
      resolve: async value => {
        calls.push(value)
        return registry.find(entity => entity.id === value || entity.slug === value
          || entity.formerSlugs?.includes(value) || entity.iamKey === value) ?? null
      },
      byId: async id => registry.find(entity => entity.id === id) ?? null,
      mintSlug: async () => 'minted',
      rename: async () => { throw new Error('not used') },
      mintName: async () => { throw new Error('not used') },
    }))
  }
  ctx.configure()
  await ctx.init()

  return { ctx: ctx as BasicContext<BasicConfig>, calls }
}

const requestFor = (entitySlug?: string, entity?: ResolvedEntity): AbstractRequest => ({
  alias: 'any', path: '/', params: {}, query: {}, headers: {},
  auth: { token: 't', type: 'oidc', userId: 'u', role: AuthRole.User, scopes: [], isUser: true,
    createdAt: new Date(), ...(entitySlug != null ? { entitySlug } : {}) } as Auth,
  ...(entity != null ? { entity } : {}),
})

const attached: ResolvedEntity = { id: 'iam-key-tenant', slug: 'tenant', iamKey: 'iam-key-tenant' }

describe('attachEntity — an entity the guard attached', () => {
  test('is kept when its slug is the token one, with no resolver registered', async () => {
    const { ctx } = await contextWith()
    const request = requestFor('tenant', attached)

    expect(await makeEntityScope(request).attachEntity(ctx)).toEqual(attached)
    expect(request.entity).toEqual(attached)
  })

  test('is kept without asking a registered resolver', async () => {
    const { ctx, calls } = await contextWith([ACME])
    const request = requestFor('tenant', attached)

    expect(await makeEntityScope(request).attachEntity(ctx)).toEqual(attached)
    expect(calls).toEqual([])
  })

  test('with another slug falls through to the resolver', async () => {
    const { ctx, calls } = await contextWith([ACME])
    const request = requestFor('acme', attached)

    expect(await makeEntityScope(request).attachEntity(ctx)).toEqual(ACME)
    expect(request.entity).toEqual(ACME)
    expect(calls).toEqual(['acme'])
  })

  test('with another slug and no resolver is dropped, never trusted', async () => {
    const { ctx } = await contextWith()
    const request = requestFor('acme', attached)

    expect(await makeEntityScope(request).attachEntity(ctx)).toBeUndefined()
    expect(request.entity).toBeUndefined()
  })

  test('on a token naming no organization is dropped', async () => {
    const { ctx } = await contextWith()
    const request = requestFor(undefined, attached)

    expect(await makeEntityScope(request).attachEntity(ctx)).toBeUndefined()
    expect(request.entity).toBeUndefined()
  })
})

describe('attachEntity — the resolver path', () => {
  test('resolves and canonicalizes a retired slug', async () => {
    const { ctx } = await contextWith([ACME])
    const request = requestFor('acme-old')

    expect(await makeEntityScope(request).attachEntity(ctx)).toEqual(ACME)
    expect(request.entity).toEqual(ACME)
    expect(request.auth?.entitySlug).toBe('acme')
  })

  test('refuses a token naming an organization the registry does not know', async () => {
    const { ctx } = await contextWith([ACME])

    await expect(makeEntityScope(requestFor('nobody')).attachEntity(ctx)).rejects.toBeInstanceOf(AuthenFailed)
  })

  test('is a no-op with no resolver and nothing attached', async () => {
    const { ctx } = await contextWith()
    const request = requestFor('acme')

    expect(await makeEntityScope(request).attachEntity(ctx)).toBeUndefined()
    expect(request.entity).toBeUndefined()
    expect(request.auth?.entitySlug).toBe('acme')
  })
})
