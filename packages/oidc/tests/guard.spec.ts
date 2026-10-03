import { describe, expect, mock, test } from 'bun:test'
import { AuthRole } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { AbstractRequest, ResolvedEntity } from '@owlmeans/entrypoint'
import type { WrappedOIDCUpdate } from '../src/types.js'

/** Whether the trusted key accepts a signature — off for the undecodable-token cases. */
let accept = false

/**
 * A bearer that cannot be decoded is a credential the server does not accept — the guard answers
 * "not authenticated" (the API layer's 401), exactly as for a signature that does not verify, and
 * never throws the decoder's own error (which the API layer answers with 500).
 */
mock.module('@owlmeans/auth-common/utils', () => ({
  trust: async () => ({ key: { verify: async () => accept } }),
  extractAuthToken: (req: { headers: Record<string, string> }, type: string, strip = true) => {
    const header = req.headers.authorization
    if (header == null || !header.toUpperCase().startsWith(type.toUpperCase())) return null
    return strip ? header.split(' ')[1] : header
  },
}))

const { makeOidcGuard } = await import('../src/guard.js')
const { OIDC_WRAPPED_TOKEN, WRAPPED_OIDC } = await import('../src/consts.js')

const call = async (authorization: string, update?: (token: string) => WrappedOIDCUpdate) => {
  const guard = makeOidcGuard() as any
  guard.assertCtx = () => ({
    cfg: { alias: 'app' },
    hasService: (alias: string) => alias === WRAPPED_OIDC && update != null,
    service: () => ({ update: async ({ token }: { token: string }) => update!(token) }),
  })
  const req = { headers: { authorization } } as unknown as AbstractRequest
  const res = { responseProvider: { header: () => undefined }, resolve: () => undefined }
  return { outcome: await guard.handle(req, res), req }
}

const wrapped = async (auth: Partial<Auth>): Promise<string> => {
  const envelope = makeEnvelopeModel<Auth>(OIDC_WRAPPED_TOKEN).send({
    type: OIDC_WRAPPED_TOKEN, token: 'session', userId: 'sub', role: AuthRole.Guest, scopes: [],
    isUser: true, createdAt: new Date(), ...auth,
  } as Auth, null)
  const token = await envelope.sign({ sign: async () => 'signature' } as never, EnvelopeKind.Token)

  return `${OIDC_WRAPPED_TOKEN.toUpperCase()} ${token}`
}

describe('oidc guard', () => {
  test('an undecodable wrapped token is unauthenticated, not a server error', async () => {
    accept = false
    expect((await call('OIDC-WRAPPED-TOKEN bogus.token')).outcome).toBe(false)
  })

  test('garbage of every shape stays unauthenticated', async () => {
    accept = false
    expect((await call('OIDC-WRAPPED-TOKEN %%%')).outcome).toBe(false)
    expect((await call('OIDC-WRAPPED-TOKEN ')).outcome).toBe(false)
  })
})

describe('oidc guard — the acting organization', () => {
  const acme: ResolvedEntity = { id: 'iam-key-acme', slug: 'acme', iamKey: 'iam-key-acme' }

  test('attaches the entity the wrapper resolved', async () => {
    accept = true
    const authorization = await wrapped({ entitySlug: 'acme' })
    const { outcome, req } = await call(authorization, token => ({ token, entity: acme }))

    expect(outcome).toBe(true)
    expect(req.entity).toEqual(acme)
  })

  test('attaches nothing when the wrapper names no organization', async () => {
    accept = true
    const authorization = await wrapped({ entitySlug: 'acme' })
    const { outcome, req } = await call(authorization, token => ({ token }))

    expect(outcome).toBe(true)
    expect(req.entity).toBeUndefined()
  })

  test('without a wrapping service there is nothing to attach', async () => {
    accept = true
    const { outcome, req } = await call(await wrapped({ entitySlug: 'acme' }))

    expect(outcome).toBe(true)
    expect(req.entity).toBeUndefined()
  })
})
