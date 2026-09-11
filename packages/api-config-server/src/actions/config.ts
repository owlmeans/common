import { implementation } from '@owlmeans/server-entrypoint'
import type { EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import { advertisedConfig } from '@owlmeans/api-config'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

export const advertise = (protocol: EntrypointProtocol<OpenRequest, OpenValue>) =>
  implementation(protocol, async (_, context) => {
  const ctx = context as ServerContext<ServerConfig>
  return advertisedConfig(ctx.cfg)
})
