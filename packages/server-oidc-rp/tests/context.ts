import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { createStaticResource } from '@owlmeans/static-resource'
import { AUTH_CACHE } from '@owlmeans/server-auth'
import { makeOidcClientService } from '../src/service.js'
import { GOOGLE_SERVICE } from '@owlmeans/oidc'
import type { Config } from '../src/types.js'

const RESOURCE_KEY = 'server-oidc-rp-test-cache'

export const makeTestContext = () => {
  const cfg: Config = {
    ready: false,
    service: 'server-oidc-rp-tests',
    type: AppType.Backend,
    services: {},
    oidc: {
      providers: [
        {
          clientId: 'google-client-id-123',
          secret: 'google-secret-456',
          service: GOOGLE_SERVICE,
          basePath: 'unused-in-unit-tests',
        },
        {
          clientId: 'keycloak-admin',
          secret: 'kc-secret',
          service: 'iam-product-api',
          basePath: 'realms/master',
          def: true,
          internal: true,
        },
      ],
    },
  } as Config

  const context = makeBasicContext(cfg) as BasicContext<Config>

  context.registerResource(createStaticResource(AUTH_CACHE, RESOURCE_KEY))
  context.registerService(makeOidcClientService())

  return context
}
