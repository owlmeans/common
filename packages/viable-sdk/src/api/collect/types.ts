import type { EntrypointTransport } from '@owlmeans/entrypoint'

export interface CallCollectOptions {
  /**
   * Whether this context runs in the DELEGATED mode (`llm=local`). Only then is a write named with
   * `x-viable-call` and an early `{ pending }` answer collected; otherwise every call passes through
   * to the API client untouched.
   */
  delegated: boolean
}

/**
 * The SDK context's HTTP transport — ONE seam in front of the API client that every bound route
 * goes through, the connector routes and the planning client alike.
 *
 * In the delegated mode a write may wait on a model call the connector's own parent performs, which
 * outlasts what an edge holds a response open. So every non-GET request carries `x-viable-call:
 * <uuid>` (kept when the request already names one, so a retry reuses it), and an answer `{ pending:
 * <that id> }` is turned into `connect.call.collect` long polls until the call settles: its value
 * resolves the original call exactly as a direct answer would have, its marshalled error is rethrown
 * as its own class, and a lost call throws `ConnectCallLost`. Any other answer is returned as is.
 */
export interface CallCollectTransport extends EntrypointTransport {
  /** Whether writes are named and collected — the delegated mode. */
  readonly delegated: boolean
}

/** A collected call's answer, as the original entrypoint would have resolved. */
export interface CollectedCall {
  value: unknown
  outcome: string
}
