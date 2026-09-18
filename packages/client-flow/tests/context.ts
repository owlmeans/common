import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { createStaticResource } from '@owlmeans/static-resource'
import type { ClientContext } from '@owlmeans/client'
import type { ClientConfig } from '@owlmeans/client-context'
import { FLOW_STATE } from '../src/consts.js'
import type { SuspendedLandingRecord } from '../src/landing.js'

/**
 * The smallest context `suspendFlow`/`resumeSuspendedFlow` need: a `FLOW_STATE` resource and
 * nothing else. A static resource is a real `Resource` implementation, so this exercises the
 * actual save/load/delete contract rather than a stand-in for it — the same pattern
 * `@owlmeans/client-auth`'s own tests use for a client-side resource.
 */
export const makeTestContext = (withResource: boolean = true): ClientContext<ClientConfig> => {
  const cfg: BasicConfig = {
    ready: false, service: 'client-flow-tests', type: AppType.Frontend, services: {},
  }
  const context = makeBasicContext(cfg) as BasicContext<BasicConfig>

  if (withResource) {
    context.registerResource(createStaticResource<SuspendedLandingRecord>(FLOW_STATE, 'client-flow-landing-tests'))
  }

  return context as unknown as ClientContext<ClientConfig>
}
