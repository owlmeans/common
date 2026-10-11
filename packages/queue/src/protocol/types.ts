import type { EntrypointProtocolDeclaration, RequestOf, ResponseOf } from '@owlmeans/entrypoint'
import type { JobEnvelope, JobOptions, JobRecord, JobReply } from '../types.js'

/** Enqueueing and awaiting QUEUE protocols in one context, with their exact types kept. */
export interface QueueProtocolHelper {
  /** Enqueue an immutable QUEUE protocol while preserving its exact request and response types. */
  enqueue: <Protocol extends EntrypointProtocolDeclaration>(
    declaration: Protocol, request: RequestOf<Protocol>, options?: JobOptions,
  ) => Promise<JobRecord<JobEnvelope, JobReply<ResponseOf<Protocol>>>>
  /** Wait for a protocol job and unwrap the typed entrypoint reply. */
  waitFor: <Protocol extends EntrypointProtocolDeclaration>(
    declaration: Protocol,
    job: string | JobRecord<JobEnvelope, JobReply<ResponseOf<Protocol>>>,
    options?: { timeout?: number },
  ) => Promise<ResponseOf<Protocol>>
}
