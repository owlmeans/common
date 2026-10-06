import { type EntrypointProtocolDeclaration, type RequestOf, type ResponseOf, isEntrypointProtocol } from '@owlmeans/entrypoint'
import { memoHelper } from '@owlmeans/context'
import { ResilientError } from '@owlmeans/error'
import { queueConfigOf } from './queue-config.js'
import { UnknownQueue } from './errors.js'
import { queueRouteHelper } from './queue-route.js'
import type { JobEnvelope, JobOptions, JobRecord, JobReply } from './types.js'
import type { QueueContext } from './types.js'
import type { QueueProtocolHelper } from './protocol/types.js'

export const makeQueueProtocolHelper = (context: QueueContext): QueueProtocolHelper => {
  const queueFor = (declaration: unknown): {
    protocol: EntrypointProtocolDeclaration
    queue: string
  } => {
    if (declaration == null || typeof declaration !== 'object' || !isEntrypointProtocol(declaration)) {
      throw new UnknownQueue('protocol declaration required')
    }
    if (!queueRouteHelper.isQueueRoute(declaration.route)) {
      throw new UnknownQueue(`${declaration.alias}: not a queue protocol`)
    }
    const { queue } = queueRouteHelper.queueRouteOptions(declaration.route)
    const configured = queueConfigOf(context.cfg).queueOf(queue)
    if (!configured.jobs.includes(declaration.alias)) {
      throw new UnknownQueue(`${queue}:${declaration.alias}`)
    }
    return { protocol: declaration, queue }
  }

  const enqueue = async <Protocol extends EntrypointProtocolDeclaration>(
    declaration: Protocol,
    request: RequestOf<Protocol>,
    options?: JobOptions,
  ): Promise<JobRecord<JobEnvelope, JobReply<ResponseOf<Protocol>>>> => {
    const { protocol, queue } = queueFor(declaration)
    const shaped = (request ?? {}) as unknown as Record<string, unknown>
    const envelope: JobEnvelope = {
      alias: protocol.alias,
      params: shaped.params as Record<string, unknown> | undefined,
      body: shaped.body,
      query: shaped.query as Record<string, unknown> | undefined,
      headers: shaped.headers as Record<string, string | undefined> | undefined,
      enqueuedAt: new Date().toISOString(),
    }

    return await context.jobs<JobEnvelope, JobReply<ResponseOf<Protocol>>>(queue).create({
      queue,
      name: protocol.alias,
      data: envelope,
      opts: options,
    })
  }

  const waitFor = async <Protocol extends EntrypointProtocolDeclaration>(
    declaration: Protocol,
    job: string | JobRecord<JobEnvelope, JobReply<ResponseOf<Protocol>>>,
    options?: { timeout?: number },
  ): Promise<ResponseOf<Protocol>> => {
    const { protocol, queue } = queueFor(declaration)
    if (typeof job !== 'string' && (job.queue !== queue || job.name !== protocol.alias)) {
      throw new UnknownQueue(`${job.queue}:${job.name}`)
    }
    const id = typeof job === 'string' ? job : job.id
    if (id == null) {
      throw new UnknownQueue(`${queue}:${protocol.alias}: missing job id`)
    }
    const reply = await context.jobs<JobEnvelope, JobReply<ResponseOf<Protocol>>>(queue)
      .wait(id, options)
    if (reply.error != null) {
      throw ResilientError.ensure(reply.error as Error | string)
    }
    return reply.value as ResponseOf<Protocol>
  }

  return { enqueue, waitFor }
}

export const queueProtocolOf = memoHelper.oncePer(makeQueueProtocolHelper)

/** @deprecated compat:factory-refactor — use `queueProtocolOf(ctx).enqueue(…)` */
export const enqueueProtocol = async <Protocol extends EntrypointProtocolDeclaration>(
  context: QueueContext,
  declaration: Protocol,
  request: RequestOf<Protocol>,
  options?: JobOptions,
): Promise<JobRecord<JobEnvelope, JobReply<ResponseOf<Protocol>>>> =>
  await queueProtocolOf(context).enqueue(declaration, request, options)

/** @deprecated compat:factory-refactor — use `queueProtocolOf(ctx).waitFor(…)` */
export const waitForProtocol = async <Protocol extends EntrypointProtocolDeclaration>(
  context: QueueContext,
  declaration: Protocol,
  job: string | JobRecord<JobEnvelope, JobReply<ResponseOf<Protocol>>>,
  options?: { timeout?: number },
): Promise<ResponseOf<Protocol>> => await queueProtocolOf(context).waitFor(declaration, job, options)
