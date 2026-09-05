import { assertContext, createService } from '@owlmeans/context'
import type { AbstractRequest, AbstractResponse, EntrypointTransport } from '@owlmeans/entrypoint'
import { EntrypointOutcome, transportAlias } from '@owlmeans/entrypoint'
import { RouteProtocols } from '@owlmeans/route'
import { ResilientError } from '@owlmeans/error'
import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import type { Config, Context, JobEnvelope, JobReply, QueueAppend } from './types.js'
import { DEFAULT_JOB_TIMEOUT } from './consts.js'
import { UnknownQueue } from './errors.js'

/**
 * The producing half of the bridge: it turns a call on a QUEUE entrypoint into a job, and the
 * job's outcome back into a reply.
 *
 * Registering it is the whole opt-in. `apiHandler` looks up a transport by the route's protocol,
 * so a consumer writes `ep.call(...)` against a declaration it shares with every other kind of
 * entrypoint and never learns which one carried it. That is also why the envelope is built from
 * the request rather than from the entrypoint: the far side rebuilds a request, and anything only
 * HTTP understands would not survive the trip anyway.
 */
export const makeQueueTransport = (alias: string = transportAlias(RouteProtocols.QUEUE)) => {
  const location = `queue-transport:${alias}`

  const service = createService<EntrypointTransport>(alias, {
    protocol: RouteProtocols.QUEUE,

    handle: (async <T>(req: AbstractRequest, res: AbstractResponse<T>) => {
      const context = assertContext<Config, Context<Config>>(service.ctx as Context<Config>, location)
      const entrypoint = context.entrypoint<CommonEntrypoint>(req.alias)
      const route = entrypoint.route.route

      if (route.queue == null) {
        throw new UnknownQueue(`${req.alias}: route declares no queue`)
      }

      const jobs = (context as unknown as QueueAppend).jobs<JobEnvelope, JobReply<T>>(route.queue)

      const envelope: JobEnvelope = {
        alias: req.alias,
        params: req.params as Record<string, unknown>,
        body: req.body,
        query: req.query as Record<string, unknown>,
        headers: req.headers as Record<string, string | undefined>,
        enqueuedAt: new Date().toISOString(),
      }

      const job = await jobs.create({ queue: route.queue, name: req.alias, data: envelope })

      // `reply: false` says the caller is not waiting for the work, only for the promise that it
      // was taken. `Accepted` plus the job's identity is the whole answer — enough to watch it.
      if (route.reply === false) {
        res.resolve({ id: job.id, queue: route.queue } as T, EntrypointOutcome.Accepted)

        return
      }

      const reply = await jobs.wait(job.id as string, {
        timeout: req.timeout ?? route.timeout ?? DEFAULT_JOB_TIMEOUT
      })

      // A processor reports a domain failure by returning it, so it crosses the hop as the class
      // it was thrown as rather than as a string a caller would have to parse.
      if (reply?.error != null) {
        throw ResilientError.ensure(reply.error as Error | string)
      }

      res.resolve(reply?.value as T, (reply?.outcome as EntrypointOutcome) ?? EntrypointOutcome.Ok)
    }) as EntrypointTransport['handle']
  })

  return service
}

export const appendQueueTransport = <C extends Config, T extends Context<C> = Context<C>>(
  context: T, alias?: string
): T => {
  const service = makeQueueTransport(alias)

  context.registerService(service)

  return context
}
