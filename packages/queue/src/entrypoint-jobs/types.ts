import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import type { JobContext, JobEnvelope, JobProcessor, JobReply } from '../types.js'

/** The queued entrypoints one context serves as a worker, and how a job of theirs is run. */
export interface EntrypointJobsHelper {
  /**
   * Every queued entrypoint this process both SERVES and LISTENS to, grouped by queue.
   *
   * Both halves are required and they answer different questions. Serving is about code — the alias
   * was bound here, so a handler exists. Listening is about deployment — this process was
   * configured to consume that queue. A worker that bound queues by what it can serve would make
   * every deployment of the same binary a worker for everything it happens to import.
   */
  served: () => Map<string, CommonEntrypoint[]>
  /**
   * A processor that runs a queued entrypoint call. The driver dispatches by job name, and an
   * entrypoint job's name IS its alias — which is what lets one worker carry both entrypoint jobs
   * and the internal steps an application registers with `process()`.
   */
  processor: () => JobProcessor<JobEnvelope, unknown>
  /**
   * Run one queued entrypoint call and describe the outcome.
   *
   * It never throws for a DOMAIN failure — the error is marshalled into the returned reply so the
   * producer can rebuild it as its own class, and so the broker does not count a legitimate refusal
   * as a job to retry. Infrastructure failures are left to propagate: those are what retries are for.
   */
  handle: (job: JobContext<JobEnvelope>) => Promise<JobReply>
}
