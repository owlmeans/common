import { handlers } from '@owlmeans/server-api'
import type { EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import { advertisedConfig } from '@owlmeans/api-config'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

const api = handlers<ServerContext<ServerConfig>>()

export const advertise = (protocol: EntrypointProtocol<OpenRequest, OpenValue>) =>
  api.request(protocol, async (_, context) => advertisedConfig(context.cfg))
