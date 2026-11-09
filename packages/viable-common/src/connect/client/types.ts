import type { ConnectClientKind } from '../consts.js'

/** One connector edition, as its `x-viable-client` header names it. */
export interface ConnectClient {
  kind: ConnectClientKind
  /** The edition's own version, when the header carried one (≤ `CONNECT_CLIENT_VERSION_MAX`). */
  version?: string
  /** The raw header value of an `Other` client, kept for the log (≤ `CONNECT_CLIENT_RAW_MAX`). */
  raw?: string
}

/**
 * `GET /connect/client` — how the platform sees the caller.
 *
 * Plain strings rather than enums: the answer crosses a version skew, and a connector older than the
 * platform must still read a kind it does not know.
 */
export interface ConnectClientView {
  kind: string
  version?: string
  /** Which door the call came through (`connect`, `mcp`, …) — the platform's own word. */
  via: string
  /** Whether this connection may perform the platform's model calls. */
  inference: boolean
}

/** The `x-viable-client` header, written and read. */
export interface ConnectClientHelper {
  /** The `x-viable-client` value for a client: `<kind>` or `<kind>/<version>` (an `Other` client's raw value). */
  format: (client: ConnectClient) => string
  /**
   * A header value → the client. Absent or empty → `Legacy`; an unknown kind → `Other` with the raw
   * value; a version longer than `CONNECT_CLIENT_VERSION_MAX` is dropped. Never throws.
   */
  parse: (header: string | string[] | undefined | null) => ConnectClient
  /** False for the `CONNECT_CLIENT_NO_INFERENCE` kinds — they never act as the platform's inference. */
  mayInfer: (kind: ConnectClientKind | string) => boolean
}
