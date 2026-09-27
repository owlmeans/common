import { describe, expect, test } from 'bun:test'
import { authorizationServerMetadata, isKnownResource, protectedResourceMetadata } from '../src/metadata.js'
import { handleAuthorize } from '../src/handlers/authorize.js'
import { createPkcePair } from '@owlmeans/oauth'
import { makeTestContext, TEST_CLIENT_ID, TEST_REDIRECT_URI } from './context.js'

/**
 * A hostname a Kubernetes secret mount populates is not always readable at the moment
 * `appendOAuthServer` runs, so `issuer`/`consentUrl`/`deviceUrl`/a resource's own `resource` may
 * each be a function of the live context instead of a plain string — resolved fresh on every call
 * that needs one, never baked in once.
 */
describe('lazily-resolved URL options', () => {
  test('a function issuer is called fresh, not cached from the first read', () => {
    let calls = 0
    const context = makeTestContext({ issuer: () => { calls += 1; return `https://call-${calls}.example.com` } })

    expect(authorizationServerMetadata(context).issuer).toBe('https://call-1.example.com')
    expect(authorizationServerMetadata(context).issuer).toBe('https://call-2.example.com')
  })

  test('a function resource resolves in the protected-resource metadata', () => {
    const context = makeTestContext({
      resources: [{ resource: (ctx) => `${ctx.cfg.oauth!.issuer as string}` }],
    })

    expect(protectedResourceMetadata(context, '')?.resource).toBe(context.cfg.oauth!.issuer)
  })

  test('isKnownResource resolves a function resource before comparing', () => {
    const context = makeTestContext({ resources: [{ resource: () => 'https://dynamic.example.com' }] })

    expect(isKnownResource(context, 'https://dynamic.example.com')).toBe(true)
    expect(isKnownResource(context, 'https://someone-else.example.com')).toBe(false)
  })

  test('a function consentUrl is used to build the redirect to consent', async () => {
    const context = makeTestContext({ consentUrl: () => 'https://dynamic-web.example.com/oauth/consent' })
    const pkce = createPkcePair()

    const outcome = await handleAuthorize(context, {
      response_type: 'code', client_id: TEST_CLIENT_ID, redirect_uri: TEST_REDIRECT_URI,
      code_challenge: pkce.challenge, code_challenge_method: 'S256',
    })

    expect(outcome.kind).toBe('to-consent')
    expect((outcome as { location: string }).location).toContain('https://dynamic-web.example.com/oauth/consent')
  })
})
