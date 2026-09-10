import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { createStaticResource } from '@owlmeans/static-resource'
import { makeMemoryTrustedResource, makeFixtureKeyPair } from '@owlmeans/test-auth'
import type { TrustedRecord } from '@owlmeans/auth-common'
import { TRUSTED } from '@owlmeans/config'
import { AUTH_CACHE, AUTH_SRV_KEY, DEFAULT_ALIAS } from '../src/consts.js'
import { makeAuthService } from '../src/service.js'

const SERVICE_NAME = 'server-auth-tests'
const RESOURCE_KEY = 'server-auth-test-cache'

/**
 * Build a test context with:
 * - AUTH_CACHE static resource (anti-replay)
 * - AUTH_SRV_KEY trusted record (external auth service key for verifying incoming credentials)
 * - SERVICE_NAME trusted record (app's own key for signing outgoing bearers)
 * - AuthService registered
 */
export const makeTestContext = () => {
  const authServiceKP = makeFixtureKeyPair('auth-service-trusted')
  const appKP = makeFixtureKeyPair('server-auth-app')

  const authServiceRecord: TrustedRecord = {
    id: authServiceKP.exportAddress(),
    name: AUTH_SRV_KEY,
    credential: authServiceKP.exportPublic(),
    scopes: ['*'],
  }

  const appRecord: TrustedRecord = {
    id: appKP.exportAddress(),
    name: SERVICE_NAME,
    credential: appKP.exportPublic(),
    secret: appKP.export(),
    scopes: ['*'],
  }

  const cfg: BasicConfig = {
    ready: false,
    service: SERVICE_NAME,
    type: AppType.Backend,
    services: {},
  }

  const context = makeBasicContext(cfg) as BasicContext<BasicConfig>

  // Register trusted records (use TRUSTED alias so trust() can find them)
  context.registerResource(makeMemoryTrustedResource([authServiceRecord, appRecord], TRUSTED))

  // Register AUTH_CACHE static resource
  context.registerResource(createStaticResource(AUTH_CACHE, RESOURCE_KEY))

  // Register auth service
  context.registerService(makeAuthService(DEFAULT_ALIAS))

  return { context, authServiceKP, appKP, authServiceRecord }
}
