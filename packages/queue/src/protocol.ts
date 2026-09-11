import type { EntrypointProtocolDeclaration, RequestOf, ResponseOf } from '@owlmeans/entrypoint'
import { isEntrypointProtocol } from '@owlmeans/entrypoint'
import { ResilientError } from '@owlmeans/error'
import { RouteProtocols } from '@owlmeans/route'
import { queueOf } from './config.js'
import { UnknownQueue } from './errors.js'
import type {
  Config, Context, JobEnvelope, JobOptions, JobRecord, JobReply, QueueAppend,
} from './types.js'

type QueueContext = Context<Config> & QueueAppend

const queueFor = (context: QueueContext, declaration: unknown): {
  protocol: EntrypointProtocolDeclaration
  queue: string
} => {
  if (declaration == null || typeof declaration !== 'object' || !isEntrypointProtocol(declaration)) {
    throw new UnknownQueue('protocol declaration required')
  }
  if (declaration.route.route.protocol !== RouteProtocols.QUEUE) {
    throw new UnknownQueue(`${declaration.alias}: not a QUEUE protocol`)
  }
  const queue = declaration.route.route.queue
  if (queue == null) {
    throw new UnknownQueue(`${declaration.alias}: route declares no queue`)
  }
  const configured = queueOf(context.cfg, queue)
  if (!configured.jobs.includes(declaration.alias)) {
    throw new UnknownQueue(`${queue}:${declaration.alias}`)
  }
  return { protocol: declaration, queue }
}

/** Enqueue an immutable QUEUE protocol while preserving its exact request and response types. */
export const enqueueProtocol = async <Protocol extends EntrypointProtocolDeclaration>(
  context: QueueContext,
  declaration: Protocol,
  request: RequestOf<Protocol>,
  options?: JobOptions,
): Promise<JobRecord<JobEnvelope, JobReply<ResponseOf<Protocol>>>> => {
  const { protocol, queue } = queueFor(context, declaration)
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

/** Wait for a protocol job and unwrap the typed entrypoint reply. */
export const waitForProtocol = async <Protocol extends EntrypointProtocolDeclaration>(
  context: QueueContext,
  declaration: Protocol,
  job: string | JobRecord<JobEnvelope, JobReply<ResponseOf<Protocol>>>,
  options?: { timeout?: number },
): Promise<ResponseOf<Protocol>> => {
  const { protocol, queue } = queueFor(context, declaration)
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
