import { describe, expect, test } from 'bun:test'
import { AppType, Layer, makeBasicContext } from '@owlmeans/context'
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
    layer: Layer.Service,
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
    entityId: 'entity-1',
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
    // `entity-1` is this subject's own entityId, and the unscoped grant covers every resource.
    await gate.assert(makeRequest(), res, ['article--modify@auth:entityId'])
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
