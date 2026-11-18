import type { LlmFetch } from '../../plugins/transport/types.js'

/** Fetch plumbing shared by the wrappers this package puts around a provider client's requests. Library-private. */
export interface FetchUtils {
  /** The global fetch, read at CALL time as the SDKs do — a replaced `globalThis.fetch` is honoured. */
  global: LlmFetch
  /**
   * `response` with `body` in place of its own: same status and headers, less `content-length` and
   * `content-encoding` — the new body is neither the sized nor the encoded one that arrived. A
   * status that may carry no body keeps the response as it is.
   */
  withBody: (response: Response, body: ReadableStream<Uint8Array>) => Response
}
