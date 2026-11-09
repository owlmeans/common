import type { ModelConfig } from '../../types.js'

/**
 * The `fetch` the provider SDK clients accept as an option. `ChatOpenAI` takes it as
 * `configuration.fetch`, `ChatAnthropic` as `clientOptions.fetch`; both SDKs call it with the
 * request URL as a string and the request init (JSON string body, `Headers`, abort signal).
 */
export interface LlmFetch {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>
}

/** What a transport is asked about when a provider plugin builds a client. */
export interface LlmTransportParams {
  /** The plugin type building the client (`ModelProvider.OpenAI`, `ModelProvider.Anthropic`, …). */
  provider: string
  /** Alias the config was registered under. */
  alias: string
  /** The rung's fully resolved config, secret already stripped. */
  config: ModelConfig
}

/**
 * Where the requests of the clients a provider plugin builds go over the wire. A transport is
 * attached by a package that knows an alternative route (a proxy, a gateway); `@owlmeans/llm`
 * itself knows none.
 */
export interface LlmTransport {
  /** The `fetch` this client should use, or `undefined` to leave it on the SDK's own. */
  fetch: (params: LlmTransportParams) => LlmFetch | undefined
}

/** The process-wide table of transports by provider — module-level on purpose, like the plugin table. */
export interface LlmTransportRegistry {
  /** Attach (or replace) the transport of a provider. Clients built from here on use it. */
  attach: (provider: string, transport: LlmTransport) => void
  /** Remove the transport of a provider. Clients already built keep the `fetch` they were given. */
  detach: (provider: string) => void
  /** The `fetch` the attached transport gives this client, or `undefined` when none is attached. */
  fetchFor: (params: LlmTransportParams) => LlmFetch | undefined
}
