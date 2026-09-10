import { handleConnection } from '@owlmeans/server-socket'
import type { AbstractResponse } from '@owlmeans/entrypoint'
import type { RefedEntrypointHandler } from '@owlmeans/server-entrypoint'
import type { EventMessage } from '@owlmeans/socket'
import { MessageType } from '@owlmeans/socket'
import type { JobEvent } from '@owlmeans/queue'
import { JOB_EVENT } from '../consts.js'
import type { JobHandlerOptions } from '../types.js'
import { jobViewer, jobsOf, owns } from '../utils/index.js'

/**
 * Push this caller's job lifecycle events down a socket.
 *
 * The frames are `JobEvent`s exactly as the queue publishes them, under the {@link JOB_EVENT}
 * event name — no shape of this package's own, so a client applies them with the contract types.
 *
 * **A `JobEvent` carries no owner**, so each one is attributed by reading its job back, and the
 * ids that answered are remembered for the life of the connection. A queue configured with
 * `removeOnComplete` therefore loses its completion events here: the record they would be
 * attributed by is gone by the time the event arrives, and an unattributable event is dropped
 * rather than fanned out to everyone. Leave completed jobs in place on any queue that is watched.
 */
export const watchJobs = (
  opts?: JobHandlerOptions
): RefedEntrypointHandler<AbstractResponse<any>> => handleConnection(async (conn, ctx, req) => {
  const resource = jobsOf(ctx, opts)
  const viewer = await jobViewer(req, ctx, opts)
  const mine = new Set<string>()

  const attributable = async (event: JobEvent): Promise<boolean> => {
    if (viewer == null || mine.has(event.id)) {
      return true
    }
    const record = await resource.load(event.id)
    if (record == null || !owns(record, viewer, opts)) {
      return false
    }
    mine.add(event.id)

    return true
  }

  const unsubscribe = await resource.subscribe(async event => {
    try {
      if (await attributable(event)) {
        await conn.notify(JOB_EVENT, event)
      }
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
