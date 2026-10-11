import { describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import type { AbstractRequest, AbstractResponse, GateService } from '@owlmeans/entrypoint'
import type { Auth } from '@owlmeans/auth'
import { AuthForbidden, AuthRole } from '@owlmeans/auth'
import { OIDC_GATE } from '@owlmeans/oidc'
import { makeIamGate } from '@owlmeans/server-iam'

const makeGate = async (): Promise<GateService> => {
  const ctx = makeBasicContext<BasicConfig>({
    ready: false,
    service: 'server-iam-tests',
    type: AppType.Backend,
  })
  ctx.registerService(makeIamGate())
  ctx.configure()
  await ctx.init()

  return ctx.service<GateService>(OIDC_GATE)
}

const makeRequest = (
  params: Record<string, string> = {},
  rest: Partial<Pick<AbstractRequest, 'query' | 'body' | 'headers'>> = {}
): AbstractRequest => ({
  alias: 'test',
  headers: {},
  params,
  query: {},
  body: {},
  ...rest,
  path: '/',
  auth: {
    type: 'oidc-wrapped-token',
    token: 'test',
    userId: 'user-1',
    role: AuthRole.User,
    scopes: [],
    entitySlug: 'entity-1',
    isUser: true,
    createdAt: new Date(),
    permissions: [
      { scope: 'my-project', permissions: { 'article--modify': true } },
      {
        scope: 'my-project',
        permissions: { 'department--modify': true },
        resources: ['dep-12345678']
      }
    ]
  } satisfies Auth
}) as unknown as AbstractRequest

const res = {} as AbstractResponse<unknown>

describe('@owlmeans/server-iam — makeIamGate (claims mode)', () => {
  test('passes an unscoped permission param', async () => {
    const gate = await makeGate()
    await gate.assert(makeRequest(), res, ['article--modify'])
  })

  test('passes a resource-scoped param when the request resource id is granted', async () => {
    const gate = await makeGate()
    await gate.assert(makeRequest({ depId: 'dep-12345678' }), res, ['department--modify@depId'])
  })

  test('params are any-of — one granted param is enough', async () => {
    const gate = await makeGate()
    await gate.assert(makeRequest(), res, ['unknown--permission', 'article--modify'])
  })

  test('rejects a resource-scoped param for an ungranted resource id', async () => {
    const gate = await makeGate()
    expect(
      gate.assert(makeRequest({ depId: 'dep-87654321' }), res, ['department--modify@depId'])
    ).rejects.toBeInstanceOf(AuthForbidden)
  })

  test('resolves a resource id from an explicitly named source', async () => {
    const gate = await makeGate()
    await gate.assert(
      makeRequest({}, { body: { department: { id: 'dep-12345678' } } }), res,
      ['department--modify@body:department.id']
    )
  })

  test('resolves a resource id from the auth object', async () => {
    const gate = await makeGate()
    // `entity-1` is this subject's own organization slug, and the unscoped grant covers every resource.
    await gate.assert(makeRequest(), res, ['article--modify@auth:entitySlug'])
  })

  /**
   * Params are OR'd, so a param the gate cannot even evaluate must contribute nothing. Letting one
   * throw would turn a typo in an unrelated sibling into a denial of a grant the subject really has.
   */
  test('a malformed param does not refuse a sibling that passes', async () => {
    const gate = await makeGate()
    await gate.assert(makeRequest(), res, ['article--modify@cookies:sid', 'article--modify'])
  })

  test('an unresolvable selector refuses without breaking the OR', async () => {
    const gate = await makeGate()
    await gate.assert(makeRequest(), res, ['department--modify@missingParam', 'article--modify'])

    expect(
      gate.assert(makeRequest(), res, ['department--modify@missingParam'])
    ).rejects.toBeInstanceOf(AuthForbidden)
  })

  /**
   * The stored grant is keyed `department--modify`; the gate splits the selector off before looking
   * it up. A grant written under the whole string — the corruption this grammar exists to stop —
   * is a key nothing reads.
   */
  test('a permission granted WITH the selector in its name never satisfies the gate', async () => {
    const gate = await makeGate()
    const req = makeRequest({ depId: 'dep-1' })
    ;(req.auth as unknown as Auth).permissions = [
      { scope: 'my-project', permissions: { 'department--modify@depId': true } }
    ]

    expect(
      gate.assert(req, res, ['department--modify@depId'])
    ).rejects.toBeInstanceOf(AuthForbidden)
  })
})

/**
 * The four permission kinds, as a relying party hands them to the gate. Normally the relying party
 * strips the binding of the acting organization's sets and drops every other bound set; a bound set
 * in a token is therefore a leak, and the gate applies it only in its own organization.
 */
describe('@owlmeans/server-iam — makeIamGate and the acting organization', () => {
  const CLIENT = 'acme-preview'

  const kindsRequest = (opts: {
    entitySlug?: string
    entity?: { id: string, slug: string }
    params?: Record<string, string>
  }): AbstractRequest => ({
    alias: 'kinds',
    headers: {},
    params: opts.params ?? {},
    query: {},
    body: {},
    path: '/',
    ...(opts.entity != null ? { entity: { ...opts.entity, iamKey: opts.entity.id } } : {}),
    auth: {
      type: 'oidc-wrapped-token',
      token: 'test',
      userId: 'user-1',
      role: AuthRole.User,
      scopes: [],
      ...(opts.entitySlug != null ? { entitySlug: opts.entitySlug } : {}),
      isUser: true,
      createdAt: new Date(),
      permissions: [
        // unbound
        { scope: CLIENT, permissions: { 'report--view': true } },
        // entity-bound
        { scope: CLIENT, permissions: { 'order--edit': true }, entitySlug: 'acme' },
        // resource-bound
        { scope: CLIENT, title: 'department--modify', permissions: { 'department--modify': true }, resources: ['dep-1'] },
        // both
        {
          scope: CLIENT, title: 'order--delete', permissions: { 'order--delete': true },
          resources: ['ord-1'], entitySlug: 'acme',
        },
        // the per-organization marker, granted against the organization's stable id
        { scope: CLIENT, permissions: { 'tenant-0123456789abcdef01234567--admin': true } },
      ],
    } as Auth,
  }) as unknown as AbstractRequest

  test.each([
    ['unbound: applies in any organization', 'report--view', { entitySlug: 'beta' }, true],
    ['unbound: applies with no organization at all', 'report--view', {}, true],
    ['entity-bound: applies in its organization', 'order--edit', { entitySlug: 'acme' }, true],
    ['entity-bound: refused in another organization', 'order--edit', { entitySlug: 'beta' }, false],
    ['entity-bound: refused with no organization (fail-closed)', 'order--edit', {}, false],
    ['resource-bound: the granted record', 'department--modify@depId', { entitySlug: 'beta', params: { depId: 'dep-1' } }, true],
    ['resource-bound: another record', 'department--modify@depId', { entitySlug: 'acme', params: { depId: 'dep-2' } }, false],
    ['both: its organization and its record', 'order--delete@id', { entitySlug: 'acme', params: { id: 'ord-1' } }, true],
    ['both: its organization, another record', 'order--delete@id', { entitySlug: 'acme', params: { id: 'ord-2' } }, false],
    ['both: its record, another organization', 'order--delete@id', { entitySlug: 'beta', params: { id: 'ord-1' } }, false],
    // The guard-attached entity is what the request acts in; the token's slug is the fallback.
    ['the attached entity wins over the token slug', 'order--edit',
      { entitySlug: 'beta', entity: { id: 'acme-key', slug: 'acme' } }, true],
    ['the attached entity refuses another organization', 'order--edit',
      { entitySlug: 'acme', entity: { id: 'beta-key', slug: 'beta' } }, false],
    ['{entity} is still the attached entity id', 'tenant-{entity}--admin',
      { entity: { id: '0123456789abcdef01234567', slug: 'acme' } }, true],
  ] as const)('%s', async (_, param, opts, granted) => {
    const gate = await makeGate()
    const attempt = gate.assert(kindsRequest(opts), res, [param])
    if (granted) {
      await attempt
    } else {
      await expect(attempt).rejects.toBeInstanceOf(AuthForbidden)
    }
  })
})
