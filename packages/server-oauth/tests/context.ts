import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { createStaticResource } from '@owlmeans/static-resource'
import { AuthRole } from '@owlmeans/auth'
import { AUTH_IDENTITY_PROFILE } from '@owlmeans/server-auth-identity'
import type { IdentityProfile } from '@owlmeans/server-auth-identity'
import { AUTH_TOKEN_RESOURCE } from '@owlmeans/auth-token'
import type { AccessTokenRecord } from '@owlmeans/auth-token'
import { appendOAuthServer } from '../src/append.js'
import { OAUTH_DCR_RESOURCE } from '../src/consts.js'
import type { OAuthDcrClientRecord, OAuthServerContext, OAuthServerOptions } from '../src/types.js'

export const TEST_ISSUER = 'https://api.example.com'
export const TEST_CONSENT_URL = 'https://app.example.com/oauth/consent'
export const TEST_DEVICE_URL = 'https://app.example.com/oauth/device'
export const TEST_RESOURCE = 'https://api.example.com'
export const TEST_MCP_RESOURCE = 'https://api.example.com/mcp'
export const TEST_CLIENT_ID = 'viable-mcp'
export const TEST_REDIRECT_URI = 'http://localhost/callback'
export const TEST_PREFIX = 'tst_'
export const TEST_ENTITY = 'entity-1'
export const TEST_PROFILE = 'profile-1'
export const TEST_USER = 'user-1'

let store = 0
let seq = 0

/**
 * Every resource this server touches, real `Resource` implementations rather than a database —
 * the same pattern `@owlmeans/server-auth-token`'s own tests use for the SAME token store. The
 * route-mounting middleware `appendOAuthServer` queues is never fired: `context.resource(...)` is
 * a synchronous lookup that needs no `init()`, and `init()` is the only thing that would run it
 * (and it would need a real Fastify server this test has no reason to stand up).
 */
export const makeTestContext = (opts: Partial<OAuthServerOptions> = {}): OAuthServerContext => {
  const key = `server-oauth-tests-${++store}`
  const cfg = { ready: false, service: 'server-oauth-tests', type: AppType.Backend, services: {} }
  const context = makeBasicContext(cfg) as unknown as OAuthServerContext & BasicContext<typeof cfg>

  const identified = <T extends { id?: string }>(resource: any): any => {
    const create = resource.create.bind(resource)
    resource.create = async (record: T, writeOpts?: unknown) =>
      await create({ ...record, id: record.id ?? `rec-${++seq}` }, writeOpts)

    return resource
  }

  context.registerResource(identified(createStaticResource<AccessTokenRecord>(AUTH_TOKEN_RESOURCE, `${key}-tokens`)))
  context.registerResource(identified(createStaticResource<IdentityProfile>(AUTH_IDENTITY_PROFILE, `${key}-profiles`)))
  context.registerResource(identified(createStaticResource<OAuthDcrClientRecord>(OAUTH_DCR_RESOURCE, `${key}-dcr`)))

  ;(context.cfg as any).authToken = { prefix: TEST_PREFIX }

  appendOAuthServer(context, {
    issuer: TEST_ISSUER,
    consentUrl: TEST_CONSENT_URL,
    deviceUrl: TEST_DEVICE_URL,
    resources: [{ resource: TEST_RESOURCE }, { resource: TEST_MCP_RESOURCE, path: '/mcp' }],
    clients: [{
      clientId: TEST_CLIENT_ID, clientName: 'Viable MCP',
      redirectUris: [TEST_REDIRECT_URI, 'http://127.0.0.1/callback'],
    }],
    ...opts,
  })

  return context
}

export const seedProfile = async (
  context: OAuthServerContext, patch: Partial<IdentityProfile> = {}
): Promise<IdentityProfile> => {
  const profiles = context.resource<any>(AUTH_IDENTITY_PROFILE)

  return await profiles.create({
    id: patch.id ?? `profile-record-${TEST_PROFILE}`,
    profileId: TEST_PROFILE, entityId: TEST_ENTITY, userId: TEST_USER,
    role: AuthRole.User, scopes: ['*'], ...patch,
  })
}

/** A session an approve/deny handler would see — an authenticated browser request. */
export const session = (patch: Record<string, unknown> = {}): any => ({
  headers: {}, params: {}, query: {}, body: {},
  entity: { id: TEST_ENTITY, slug: TEST_ENTITY },
  auth: {
    profileId: TEST_PROFILE, userId: TEST_USER, entitySlug: TEST_ENTITY,
    role: AuthRole.User, scopes: ['*'], ...patch,
  },
})
