
import type { ReconnectPolicy } from './types.js'

/**
 * 0.2s → 3s geometric backoff, retried for up to 10 minutes before the carrier gives up and
 * reports the connection lost. See the client-socket skill's "Disconnects" section.
 */
export const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  minDelay: 200,
  maxDelay: 3_000,
  factor: 2,
  jitter: 0.1,
  budget: 600_000,
  stableAfter: 10_000,
  heartbeat: 30_000,
  pongTimeout: 10_000,
}
