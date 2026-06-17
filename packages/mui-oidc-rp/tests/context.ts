import { AppType, Layer, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'

export const makeTestContext = () => {
  const cfg: BasicConfig = {
    ready: false,
    service: 'web-oidc-rp-tests',
    layer: Layer.Application,
    type: AppType.Frontend,
    services: {},
  }

  const context = makeBasicContext(cfg) as BasicContext<BasicConfig>

  return context
}
