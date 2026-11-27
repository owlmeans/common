import type { EntrypointTransport } from '@owlmeans/entrypoint'
import type { ConnectClient } from '@owlmeans/viable-common'

export interface CallCollectOptions {
  /**
   * Whether this context runs in the DELEGATED mode (`llm=local`). Then every write is named with
   * `x-viable-call` and an early `{ pending }` answer collected; otherwise only the always-collected
   * calls (`ALWAYS_COLLECTED_ALIASES`: a change of the project's apps, a triaged request, Run all's
   * proposal) are, and every other call passes through to the API client untouched but for the client
   * header.
   */
  delegated: boolean
  /**
   * The edition every request names in `x-viable-client` — in every mode, on the connector routes
   * and the planning client alike. `{ kind: sdk }` when absent.
   */
  client?: ConnectClient
}

/**
 * The SDK context's HTTP transport — ONE seam in front of the API client that every bound route
 * goes through, the connector routes and the planning client alike.
 *
 * Every request names the connector's edition in `x-viable-client` (`CallCollectOptions.client`),
 * whatever the mode.
 *
 * In the delegated mode a write may wait on a model call the connector's own parent performs, which
 * outlasts what an edge holds a response open; in EVERY mode a change of the project's apps
 * (`connect.apps.*`, a short run with its rebuild), a triaged request (`connect.project.request`,
 * which may wait for the preview to wake) and Run all's proposal (`connect.cards.plan`, a GET holding one
 * model call) may too (`ALWAYS_COLLECTED_ALIASES`). So each delegated non-GET request and each
 * always-collected one carries `x-viable-call: <uuid>` (kept when the request already names one, so a retry
 * reuses it), and an answer `{ pending: <that id> }` is turned into `connect.call.collect` long polls until the call settles: its value
 * resolves the original call exactly as a direct answer would have, its marshalled error is rethrown
 * as its own class, and a lost call throws `ConnectCallLost`. Any other answer is returned as is.
 */
export interface CallCollectTransport extends EntrypointTransport {
  /** Whether EVERY write is named and collected — the delegated mode (the always-collected ones are in any mode). */
  readonly delegated: boolean
  /** The `x-viable-client` value every request carries. */
  readonly client: string
}

/** A collected call's answer, as the original entrypoint would have resolved. */
export interface CollectedCall {
  value: unknown
  outcome: string
}
