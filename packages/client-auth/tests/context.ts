import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { createStaticResource } from '@owlmeans/static-resource'
import { authProtocols } from '@owlmeans/auth-common'
import { makeClientContext } from '@owlmeans/client'
import type { ClientContext } from '@owlmeans/client'
import type { ClientConfig } from '@owlmeans/client-context'
import { bindScreen, stab } from '@owlmeans/client-entrypoint'
import { appendWebRouter } from '@owlmeans/web-router'
import { AUTH_RESOURCE, DEFAULT_ALIAS } from '../src/consts.js'
import { makeAuthService } from '../src/service.js'

const RESOURCE_KEY = 'client-auth-test-store'

export const makeTestContext = () => {
  const cfg: BasicConfig = {
    ready: false,
    service: 'client-auth-tests',
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

export const BROWSER_SERVICE = 'client-auth-web'

/**
 * A browser application's context — `makeClientContext` with the OwlMeans browser router — whose
 * own frontend service carries `base` (none when omitted), with the dispatcher, the surrogate and
 * the typed sign-in screens bound: what `web-client` gives every application.
 */
export const makeBrowserTestContext = (base?: string): ClientContext => {
  const context = makeClientContext({
    ready: false, service: BROWSER_SERVICE, type: AppType.Frontend, debug: {},
    services: {
      [BROWSER_SERVICE]: {
        service: BROWSER_SERVICE, type: AppType.Frontend, host: 'example.com', ...(base != null ? { base } : {}),
      },
    },
  } as unknown as ClientConfig) as ClientContext
  appendWebRouter(context)
  context.registerResource(createStaticResource(AUTH_RESOURCE, `${RESOURCE_KEY}-browser`))
  context.registerService(makeAuthService(DEFAULT_ALIAS))
  context.registerEntrypoints([
    bindScreen(authProtocols.dispatcher, stab),
    bindScreen(authProtocols.surrogate, stab),
    bindScreen(authProtocols.client, stab),
    bindScreen(authProtocols.login, stab),
    bindScreen(authProtocols.loginTyped, stab),
  ])

  return context
}
