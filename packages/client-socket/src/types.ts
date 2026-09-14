
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '@owlmeans/client'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { InitializedService } from '@owlmeans/context'

export interface Config extends ClientConfig {
  socket?: SocketClientSettings
}

export interface Context<C extends Config = Config> extends ClientContext<C> { }

/**
 * How aggressively a dropped socket is retried, and when the carrier gives up on it.
 *
 * The delay grows geometrically from `minDelay` to `maxDelay` (±`jitter`, a fraction of the
 * computed delay) and stays there. `budget` is measured from the connection's FIRST failed
 * attempt in an outage — a socket that opens and drops again right away does not get a fresh
 * budget — and `stableAfter` is how long a reopened socket must stay up before the attempt
 * counter and the outage clock reset, so a flapping link is never read as "recovered" between
 * two drops a second apart.
 */
export interface ReconnectPolicy {
  /** First retry delay, in ms. Default 200. */
  minDelay: number
  /** Delay ceiling, in ms — the backoff never grows past this. Default 3000. */
  maxDelay: number
  /** Geometric growth factor applied to the delay after every failed attempt. Default 2. */
  factor: number
  /** Randomization applied to each computed delay, as a fraction of it. Default 0.1 (±10%). */
  jitter: number
  /** Total time, in ms, the carrier keeps retrying before it reports the socket lost. Default
   *  600000 (10 minutes). */
  budget: number
  /** How long a reopened socket must stay open before the attempt count and the outage clock
   *  reset, in ms. Default 10000. */
  stableAfter: number
  /** Heartbeat ping interval, in ms. Default 30000. */
  heartbeat: number
  /** How long to wait for ANY inbound frame after a ping before treating the socket as dead and
   *  forcing it closed, in ms. Default 10000. */
  pongTimeout: number
}

export interface SocketClientSettings {
  /** `false` disables reconnection outright — a dropped socket is reported gone and stays gone,
   *  the pre-reconnect-support behaviour. Anything else merges over the defaults. */
  reconnect?: false | Partial<ReconnectPolicy>
}

export interface ConnectOptions {
  reconnect?: false | Partial<ReconnectPolicy>
}

export interface WsOptions extends ConnectOptions {
  /**
   * Run before every connection attempt, the first one included, given the request that will be
   * turned into the socket URL — where a caller refreshes a token or other query/param value
   * that may have changed since the previous attempt.
   */
  beforeConnect?: (request: AbstractRequest<any>) => void | Promise<void>
}

/** The coarse health of a socket connection — the worst of everything a status service tracks. */
export type SocketConnectionState = 'online' | 'reconnecting' | 'lost'

export interface SocketStatusService extends InitializedService {
  /** Record this connection's current state under `id` — call again to update it. */
  report: (id: string, state: SocketConnectionState) => void
  /** Stop tracking `id` (the connection closed on purpose). */
  release: (id: string) => void
  /** The worst state across every tracked connection; `'online'` when none are tracked. */
  state: () => SocketConnectionState
  subscribe: (listener: (state: SocketConnectionState) => void) => () => void
}

export interface SocketStatusServiceAppend {
  socketStatus: () => SocketStatusService
}
