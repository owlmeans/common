import { AppType, Layer, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { createStaticResource } from '@owlmeans/static-resource'
import { AUTH_RESOURCE, DEFAULT_ALIAS } from '../src/consts.js'
import { makeAuthService } from '../src/service.js'

const RESOURCE_KEY = 'client-auth-test-store'

export const makeTestContext = () => {
  const cfg: BasicConfig = {
    ready: false,
    service: 'client-auth-tests',
    layer: Layer.Application,
    type: AppType.Frontend,
    services: {},
  }

  const context = makeBasicContext(cfg) as BasicContext<BasicConfig>

  // AUTH_RESOURCE stores the bearer token record
  context.registerResource(createStaticResource(AUTH_RESOURCE, RESOURCE_KEY))

  // Register client auth service
  context.registerService(makeAuthService(DEFAULT_ALIAS))

  return context
}
