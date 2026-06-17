import { describe, test, expect } from 'bun:test'
import { extractGoogleUrl, buildCallbackCredentials } from '../src/auth/plugins/helpers.js'
import { AUTH_SCOPE, AuthRole } from '@owlmeans/auth'
import { makeFixtureKeyPair, signMockEnvelope } from '@owlmeans/test-auth'
import { EnvelopeKind } from '@owlmeans/basic-envelope'

describe('@owlmeans/mui-oidc-rp — extractGoogleUrl', () => {
  test('strips source prefix from envelope message', async () => {
    const kp = makeFixtureKeyPair('web-oidc-test')
    const googleUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&state=xyz'
    const source = 'https://example.com/auth'
    const challengeMsg = `${source}:${googleUrl}`
    // Create a signed envelope wrapping the prefixed URL
    const envelope = await signMockEnvelope(challengeMsg, 'string', EnvelopeKind.Wrap, kp)

    const result = extractGoogleUrl(envelope, source)

    expect(result).toBe(googleUrl)
  })

  test('handles raw URL without source prefix', async () => {
    const kp = makeFixtureKeyPair('web-oidc-test-2')
    const googleUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&state=xyz'
    const envelope = await signMockEnvelope(googleUrl, 'string', EnvelopeKind.Wrap, kp)

    const result = extractGoogleUrl(envelope, 'https://different.example.com')

    expect(result).toBe(googleUrl)
  })

  test('handles empty source prefix', async () => {
    const kp = makeFixtureKeyPair('web-oidc-test-3')
    const googleUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc'
    const envelope = await signMockEnvelope(googleUrl, 'string', EnvelopeKind.Wrap, kp)

    const result = extractGoogleUrl(envelope, '')

    expect(result).toBe(googleUrl)
  })
})

describe('@owlmeans/mui-oidc-rp — buildCallbackCredentials', () => {
  test('builds AuthCredentials from query params', () => {
    const queryString = 'code=4/0abc123&state=test-state-xyz&scope=openid+email'
    const type = 'google-oauth'
    const challenge = 'stored-challenge-value'

    const creds = buildCallbackCredentials(queryString, type, challenge)

    expect(creds.type).toBe('google-oauth')
    expect(creds.challenge).toBe('stored-challenge-value')
    expect(creds.credential).toBe(queryString)
    expect(creds.role).toBe(AuthRole.User)
    expect(creds.userId).toBe('code')
    expect(creds.scopes).toEqual([AUTH_SCOPE])
  })

  test('works with empty challenge', () => {
    const creds = buildCallbackCredentials('code=x&state=y', 'google-oauth', '')

    expect(creds.challenge).toBe('')
    expect(creds.credential).toBe('code=x&state=y')
  })
})
