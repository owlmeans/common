import { connection } from '@owlmeans/server-socket'
import type { EventMessage } from '@owlmeans/socket'
import { MessageType } from '@owlmeans/socket'
import { JOB_EVENT } from '@owlmeans/job'
import type { JobViewEvent } from '@owlmeans/job'
import type { JobEvent } from '@owlmeans/queue'
import type { Context, JobEntrypoints, JobHandlerOptions } from '../types.js'
import { jobsOf } from '../utils/index.js'

/**
 * Push this caller's job lifecycle events down a socket.
 *
 * Broker events are resolved inside the caller's audience and mapped to {@link JobViewEvent}; raw
 * queue ids, payloads, failures and ownership fields never cross the socket boundary.
 *
 * **A `JobEvent` carries no owner**, so each one is attributed by reading its job back, and the
 * ids that answered are remembered for the life of the connection. A queue configured with
 * `removeOnComplete` therefore loses its completion events here: the record they would be
 * attributed by is gone by the time the event arrives, and an unattributable event is dropped
 * rather than fanned out to everyone. Leave completed jobs in place on any queue that is watched.
 */
export const watchJobs = (
  protocol: JobEntrypoints['watch'],
  opts: JobHandlerOptions
): ReturnType<typeof connection> => connection<typeof protocol, Context>(protocol, async (conn, ctx, req) => {
  const resource = jobsOf(ctx, opts)
  const audience = await opts.policy.audience(req, ctx)
  const publicIds = new Map<string, string>()

  const project = async (event: JobEvent): Promise<JobViewEvent | null> => {
    const record = await resource.load({
      $and: [{ id: event.id }, opts.policy.where(audience, {})],
    })
    if (record != null) {
      const job = await opts.policy.map(record, audience)
      publicIds.set(event.id, job.id)
      return { type: 'upsert', job }
    }
    const id = publicIds.get(event.id)
    return id == null ? null : { type: 'remove', id }
  }

  const unsubscribe = await resource.subscribe(async event => {
    try {
      const projected = await project(event)
      if (projected != null) await conn.notify(JOB_EVENT, projected)
    } catch (e) {
      console.error('Job watch notify error:', e)
    }
  })

  conn.listen(async message => {
    if (typeof message !== 'object') {
      return
    }
    const msg = message as EventMessage<void>
    if (msg.type === MessageType.System && msg.event === 'close') {
      try {
        await unsubscribe()
      } catch (e) {
        console.error('Job watch unsubscribe error:', e)
      }
    }
  })
})
