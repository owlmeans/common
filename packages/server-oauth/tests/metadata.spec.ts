import { describe, expect, test } from 'bun:test'
import { makeOAuthMetadataHelper } from '../src/metadata.js'
import { makeTestContext, TEST_ISSUER, TEST_MCP_RESOURCE, TEST_RESOURCE } from './context.js'

describe('authorizationServerMetadata', () => {
  test('advertises PKCE S256, both grants, and the token-less auth method', () => {
    const context = makeTestContext()
    const metadata = makeOAuthMetadataHelper(context).authorizationServerMetadata()

    expect(metadata.issuer).toBe(TEST_ISSUER)
    expect(metadata.code_challenge_methods_supported).toEqual(['S256'])
    expect(metadata.grant_types_supported).toEqual([
      'authorization_code', 'urn:ietf:params:oauth:grant-type:device_code',
    ])
    expect(metadata.token_endpoint_auth_methods_supported).toEqual(['none'])
    expect(metadata.client_id_metadata_document_supported).toBe(true)
    expect(metadata.authorization_response_iss_parameter_supported).toBe(true)
    expect(metadata.registration_endpoint).toBe(`${TEST_ISSUER}/oauth/register`)
  })

  test('omits registration_endpoint when DCR is turned off', () => {
    const context = makeTestContext({ allowDynamicRegistration: false })

    expect(makeOAuthMetadataHelper(context).authorizationServerMetadata().registration_endpoint).toBeUndefined()
  })

  test('omits client_id_metadata_document_supported\'s true when CIMD is turned off', () => {
    const context = makeTestContext({ allowClientIdMetadataDocuments: false })

    expect(makeOAuthMetadataHelper(context).authorizationServerMetadata().client_id_metadata_document_supported).toBe(false)
  })
})

describe('protectedResourceMetadata', () => {
  test('answers the root resource and a sub-path resource by their own configured path', () => {
    const context = makeTestContext()

    expect(makeOAuthMetadataHelper(context).protectedResourceMetadata('')).toEqual({
      resource: TEST_RESOURCE, authorization_servers: [TEST_ISSUER], bearer_methods_supported: ['header'],
    })
    expect(makeOAuthMetadataHelper(context).protectedResourceMetadata('/mcp')).toEqual({
      resource: TEST_MCP_RESOURCE, authorization_servers: [TEST_ISSUER], bearer_methods_supported: ['header'],
    })
  })

  test('answers null for a path nothing was configured for', () => {
    const context = makeTestContext()

    expect(makeOAuthMetadataHelper(context).protectedResourceMetadata('/unknown')).toBeNull()
  })
})

describe('protectedResourceChallenge', () => {
  test('is a well-formed Bearer challenge naming the resource metadata URL', () => {
    const context = makeTestContext()

    expect(makeOAuthMetadataHelper(context).protectedResourceChallenge('/mcp')).toBe(
      `Bearer resource_metadata="${TEST_ISSUER}/.well-known/oauth-protected-resource/mcp"`
    )
  })

  test('puts error before resource_metadata, correctly comma-separated after the scheme', () => {
    const context = makeTestContext()

    expect(makeOAuthMetadataHelper(context).protectedResourceChallenge('', { error: 'invalid_token' })).toBe(
      `Bearer error="invalid_token", resource_metadata="${TEST_ISSUER}/.well-known/oauth-protected-resource"`
    )
  })
})
