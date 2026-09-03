import type { AbstractRequest, CommonEntrypoint, GuardService } from '@owlmeans/entrypoint'
import type { BasicContext } from '@owlmeans/context'
import { EntrypointOutcome, provideResponse } from '@owlmeans/entrypoint'
import type { Auth } from '@owlmeans/auth'
import { AuthorizationError } from '@owlmeans/auth'
import { attachEntity } from '@owlmeans/auth-common'
import { ResilientError } from '@owlmeans/error'
import type { Config, Context, JobContext, JobEnvelope, JobReply } from './types.js'
import { EnvelopeExpired, JobNotServed } from './errors.js'

/**
 * Rebuild the request the producer described. A queued call is still a call: the same guards, the
 * same filter, the same handler run against it — only the wire is different.
 */
export const requestOf = (
  envelope: JobEnvelope, path: string, context?: BasicContext<any>
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
  original: context != null ? { _ctx: context } : undefined,
})

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
export const assertFresh = (envelope: JobEnvelope, ttl?: number): void => {
  if (ttl == null || envelope.enqueuedAt == null) {
    return
  }
  const age = (Date.now() - new Date(envelope.enqueuedAt).getTime()) / 1000
  if (age > ttl) {
    throw new EnvelopeExpired(`${envelope.alias}: ${Math.round(age)}s > ${ttl}s`)
  }
}

/**
 * Run one queued entrypoint call and describe the outcome.
 *
 * It never throws for a DOMAIN failure — the error is marshalled into the returned reply so the
 * producer can rebuild it as its own class, and so the broker does not count a legitimate refusal
 * as a job to retry. Infrastructure failures are left to propagate: those are what retries are for.
 */
export const handleJob = async <C extends Config, T extends Context<C>>(
  context: T, job: JobContext<JobEnvelope>
): Promise<JobReply> => {
  const envelope = job.data

  try {
    assertFresh(envelope, context.cfg.queue?.envelopeTtl)

    const entrypoint = context.entrypoint<CommonEntrypoint>(envelope.alias)
    if (entrypoint.handle == null) {
      throw new JobNotServed(envelope.alias)
    }

    const request = requestOf(envelope, entrypoint.path(), context)
    const response = provideResponse<unknown>()

    const guards = entrypoint.getGuards()
    if (guards.length > 0) {
      let matched: GuardService | undefined
      for (const alias of guards) {
        const guard: GuardService = context.service(alias)
        if (await guard.match(request, response)) {
          matched = guard
          break
        }
      }
      if (matched == null) {
        throw new AuthorizationError(`queue:${envelope.alias}`)
      }

      const auth = provideResponse<Auth>()
      if (!await matched.handle<boolean>(request, auth)) {
        throw new AuthorizationError(`queue:${envelope.alias}:${matched.alias}`)
      }
      request.auth = auth.value

      const entity = await attachEntity(context, request)
      if (entity != null) {
        request.entity = entity
      }
    }

    await entrypoint.handle(request, response)

    if (response.error != null) {
      return { error: ResilientError.marshal(response.error).message }
    }

    return { value: response.value, outcome: response.outcome ?? EntrypointOutcome.Ok }
  } catch (e) {
    // A refusal the caller must see as its own class — `ContentRefused`, `AgentLocked` — travels
    // in the reply. Only a broker- or connection-level fault should ever reach the retry logic:
    // retrying a refusal just spends the work again to be refused identically.
    if (e instanceof ResilientError) {
      return { error: ResilientError.marshal(e).message }
    }

    throw e
  }
}
