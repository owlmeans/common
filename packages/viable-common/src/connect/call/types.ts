import type { ConnectCallState } from '../consts.js'

/**
 * The body of a delegated write answered EARLY (HTTP 202, `EntrypointOutcome.Accepted`): the call
 * named by the `x-viable-call` header is still running, and its outcome is collected by that id.
 */
export interface ConnectCallPending {
  /** The call id the request carried in `x-viable-call`. */
  pending: string
}

/** What one collect of a named call answers. */
export interface ConnectCallResult {
  state: ConnectCallState
  /** The entrypoint outcome the call would have answered with (`ok`, `created`, …); settled only. */
  outcome?: string
  /** The value the call would have answered with — any JSON; settled without `error` only. */
  value?: unknown
  /** The call's failure, marshalled (`ResilientError.marshal(error).message`); settled only. */
  error?: string
}

/** The collect route's path parameters. */
export interface ConnectCallCollectParams {
  callId: string
}

/** The collect route's query: how long to hold, in seconds — at most `CONNECT_CALL_COLLECT_WAIT_SEC`. */
export interface ConnectCallCollectQuery {
  wait?: number
}
