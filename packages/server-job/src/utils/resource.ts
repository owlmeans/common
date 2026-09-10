import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { JobRecord, QueueResource } from '@owlmeans/queue'
import { UnknownJob } from '@owlmeans/queue'
import type { Context, JobHandlerOptions } from '../types.js'
import { ownerOf } from './owner.js'

/**
 * The queue these handlers read.
 *
 * Named by the declaration or, with nothing named, the context's sole declared queue — which
 * `ctx.jobs()` refuses to guess once a second queue exists, so an app that grows one is told to
 * name it rather than quietly served the wrong backlog.
 */
export const jobsOf = <D = unknown, R = unknown>(
  ctx: BasicContext<BasicConfig>, opts?: JobHandlerOptions
): QueueResource<D, R> => (ctx as unknown as Context).jobs<D, R>(opts?.queue)

/** Does this viewer own that record? An unscoped viewer (`undefined`) owns everything. */
export const owns = (
  record: JobRecord, viewer: string | undefined, opts?: JobHandlerOptions
): boolean => viewer == null || ownerOf(record, opts) === viewer

/**
 * One job, as this viewer is allowed to see it.
 *
 * A job that exists but belongs to someone else answers exactly as an absent one does: telling an
 * unauthorized caller apart from a wrong id is what turns an id space into an enumeration oracle.
 *
 * @throws {UnknownJob}
 */
export const readOwnedJob = async <D = unknown, R = unknown>(
  resource: QueueResource<D, R>, id: string, viewer: string | undefined, opts?: JobHandlerOptions
): Promise<JobRecord<D, R>> => {
  const record = await resource.load(id)
  if (record == null || !owns(record, viewer, opts)) {
    throw new UnknownJob(`${resource.queue}:${id}`)
  }

  return record
}
