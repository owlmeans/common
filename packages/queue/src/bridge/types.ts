import type { BasicContext } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { JobEnvelope, QueueJobMeta } from '../types.js'

/** The envelope ↔ request bridge a queued entrypoint call crosses. */
export interface QueueBridgeHelper {
  /**
   * Rebuild the request the producer described. A queued call is still a call: the same guards, the
   * same filter, the same handler run against it — only the wire is different.
   */
  requestOf: (envelope: JobEnvelope, path: string, context?: BasicContext<any>, job?: QueueJobMeta) => AbstractRequest
  /** Read broker identity only where an entrypoint truly needs to bind work to an admission claim. */
  queueJobOf: (request: unknown) => QueueJobMeta | null
  /**
   * Freshness is judged from when the job was ENQUEUED, not from now.
   *
   * A signed envelope proves who produced it, and a replay window keeps a captured one from being
   * useful forever. But a job can legitimately sit behind a long backlog, and judging it on pickup
   * would reject exactly the work that a busy queue delayed — so the producer's timestamp is what
   * the window applies to.
   *
   * @throws {EnvelopeExpired}
   */
  assertFresh: (envelope: JobEnvelope, ttl?: number) => void
}
