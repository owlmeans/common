import type { ReconnectPolicy, SocketConnectionState } from '../types.js'
import type { Connection } from '@owlmeans/socket'

export interface ConnectionOpener {
  (): Promise<WebSocket>
}

export interface ManagedConnectionOptions {
  policy: ReconnectPolicy
  /** Whether a drop schedules a retry at all. `false` keeps the pre-reconnect-support
   *  behaviour — one attempt, report and stop — while the heartbeat/liveness check below still
   *  runs exactly as it always did. */
  retry: boolean
  /** Opens a fresh socket for the first attempt and every retry — already reflecting whatever a
   *  caller's `beforeConnect` refreshed (a token, most often). Resolves once the socket is OPEN,
   *  rejects on a handshake failure. */
  open: ConnectionOpener
  /** Told this connection's coarse health, if a caller wants to aggregate it — the status
   *  service `@owlmeans/web-panel`'s reload dialog reads. */
  onStatus?: (state: SocketConnectionState) => void
}

export interface ManagedConnection {
  connection: Connection
  /** Settles once the first socket opens; rejects with `SocketConnectionError('lost')` once the
   *  retry budget elapses first (or the single attempt fails, with `retry: false`). */
  ready: Promise<void>
  /** Restart retrying a connection that gave up after its budget: one attempt at once, then the
   *  usual backoff within `policy.reviveBudget`. On a connection still waiting out a backoff
   *  delay: attempt at once, and leave it at least `reviveBudget`. A no-op otherwise — a terminal
   *  close (client close, 1000/1008, `retry: false`) is never revived. */
  revive: () => void
}
