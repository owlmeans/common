import { describe, expect, mock, test } from 'bun:test'

/**
 * A bearer that cannot be decoded is a credential the server does not accept — the guard answers
 * "not authenticated" (the API layer's 401), exactly as for a signature that does not verify, and
 * never throws the decoder's own error (which the API layer answers with 500).
 */
mock.module('@owlmeans/auth-common/utils', () => ({
  trust: async () => ({ key: { verify: async () => false } }),
  extractAuthToken: (req: { headers: Record<string, string> }, type: string, strip = true) => {
    const header = req.headers.authorization
    if (header == null || !header.toUpperCase().startsWith(type.toUpperCase())) return null
    return strip ? header.split(' ')[1] : header
  },
}))

const { makeOidcGuard } = await import('../src/guard.js')

const call = async (authorization: string) => {
  const guard = makeOidcGuard() as any
  guard.assertCtx = () => ({ cfg: { alias: 'app' } })
  const res = { responseProvider: { header: () => undefined } }
  return await guard.handle({ headers: { authorization } }, res)
}

describe('oidc guard', () => {
  test('an undecodable wrapped token is unauthenticated, not a server error', async () => {
    expect(await call('OIDC-WRAPPED-TOKEN bogus.token')).toBe(false)
  })

  test('garbage of every shape stays unauthenticated', async () => {
    expect(await call('OIDC-WRAPPED-TOKEN %%%')).toBe(false)
    expect(await call('OIDC-WRAPPED-TOKEN ')).toBe(false)
  })
})
