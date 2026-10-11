import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { BasicContext } from '@owlmeans/context'
import type { JobEnvelope, QueueJobMeta } from './types.js'
import type { QueueBridgeHelper } from './bridge/types.js'
import { EnvelopeExpired } from './errors.js'

export const createQueueBridgeHelper = (): QueueBridgeHelper => {
  const requestOf = (
    envelope: JobEnvelope, path: string, context?: BasicContext<any>, job?: QueueJobMeta,
  ): AbstractRequest => ({
    alias: envelope.alias,
    params: (envelope.params ?? {}) as AbstractRequest['params'],
    body: envelope.body as AbstractRequest['body'],
    headers: (envelope.headers ?? {}) as AbstractRequest['headers'],
    query: (envelope.query ?? {}) as AbstractRequest['query'],
    path,
    // Handlers reach their context through `original._ctx`, which the HTTP boundary sets on the raw
    // Fastify request. There is no raw request here, so the shape is supplied deliberately — a
    // handler must not have to know which transport delivered it.
    original: context != null || job != null ? { _ctx: context, _job: job } : undefined,
  })

  const queueJobOf = (request: unknown): QueueJobMeta | null => {
    if (request == null || typeof request !== 'object' || !('original' in request)) return null
    const original = (request as { original?: unknown }).original
    if (original == null || typeof original !== 'object' || !('_job' in original)) return null
    return (original as { _job?: QueueJobMeta })._job ?? null
  }

  const assertFresh = (envelope: JobEnvelope, ttl?: number): void => {
    if (ttl == null || envelope.enqueuedAt == null) {
      return
    }
    const age = (Date.now() - new Date(envelope.enqueuedAt).getTime()) / 1000
    if (age > ttl) {
      throw new EnvelopeExpired(`${envelope.alias}: ${Math.round(age)}s > ${ttl}s`)
    }
  }

  return { requestOf, queueJobOf, assertFresh }
}

export const queueBridgeHelper = createQueueBridgeHelper()

/** @deprecated compat:factory-refactor — use `queueBridgeHelper.queueJobOf(…)` */
export const queueJobOf = (request: unknown): QueueJobMeta | null => queueBridgeHelper.queueJobOf(request)
