import type { LlmFetch, LlmTransport, LlmTransportParams, LlmTransportRegistry } from './transport/types.js'

export const createLlmTransportRegistry = (): LlmTransportRegistry => {
  const transports = new Map<string, LlmTransport>()

  const attach = (provider: string, transport: LlmTransport): void => {
    transports.set(provider, transport)
  }

  const detach = (provider: string): void => {
    transports.delete(provider)
  }

  const fetchFor = (params: LlmTransportParams): LlmFetch | undefined =>
    transports.get(params.provider)?.fetch(params)

  return { attach, detach, fetchFor }
}

/**
 * Process-wide, like the plugin table: a transport attached through any instance governs every
 * client the plugins build afterwards.
 */
export const llmTransportRegistry = createLlmTransportRegistry()
