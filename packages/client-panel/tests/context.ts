import { makeClientContext } from '@owlmeans/client'
import type { ClientContext } from '@owlmeans/client'
import type { ClientConfig } from '@owlmeans/client-context'
import { bindScreen, stab } from '@owlmeans/client-entrypoint'
import { AppType } from '@owlmeans/context'
import { openProtocol } from '@owlmeans/entrypoint'
import { frontend, route } from '@owlmeans/route'

export const WEB = 'panel-web'
export const OTHER_WEB = 'panel-other-web'

/** The screens a navigation addresses: plain, nested, parameterized, trailing-slashed, another app's. */
export const screens = {
  users: openProtocol(route('panel:users', '/users', frontend())),
  userList: openProtocol(route('panel:users:list', '/list', frontend('panel:users'))),
  user: openProtocol(route('panel:user', '/user/:id', frontend())),
  settings: openProtocol(route('panel:settings', '/settings/', frontend())),
  reports: openProtocol(route('panel:reports', '/reports', frontend({ service: OTHER_WEB }))),
}

/**
 * A browser context whose own frontend service carries `base` (none when omitted), with the
 * screens above bound — the shape `makeContext` gives an application built on `client-panel`.
 */
export const makeTestContext = (base?: string): ClientContext => {
  const services = {
    [WEB]: { service: WEB, type: AppType.Frontend, host: 'example.com', ...(base != null ? { base } : {}) },
    [OTHER_WEB]: { service: OTHER_WEB, type: AppType.Frontend, host: 'example.com', base: 'reports' },
  }
  const context = makeClientContext({
    ready: false, service: WEB, type: AppType.Frontend, services, debug: {},
  } as unknown as ClientConfig) as ClientContext
  context.registerEntrypoints(Object.values(screens).map(screen => bindScreen(screen, stab)))

  return context
}
