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

const makeRequest = (params: Record<string, string> = {}): AbstractRequest => ({
  alias: 'test',
  headers: {},
  params,
  query: {},
  body: {},
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
})
