import { AppType, memoHelper } from '@owlmeans/context'
import type { CommonEntrypoint, GuardService } from '@owlmeans/entrypoint'
import { EntrypointOutcome, provideResponse } from '@owlmeans/entrypoint'
import type { Auth } from '@owlmeans/auth'
import { AuthorizationError } from '@owlmeans/auth'
import { ResilientError } from '@owlmeans/error'
import type { Config, Context, JobContext, JobEnvelope, JobProcessor, JobReply } from './types.js'
import type { EntrypointJobsHelper } from './entrypoint-jobs/types.js'
import { JobNotServed } from './errors.js'
import { queueBridgeHelper } from './bridge.js'
import { queueRouteHelper } from './queue-route.js'
import { makeEntityScope } from '@owlmeans/auth-common'

export const makeEntrypointJobsHelper = (context: Context<Config>): EntrypointJobsHelper => {
  const served = (): Map<string, CommonEntrypoint[]> => {
    const listen = context.cfg.queue?.listen ?? []
    const served = new Map<string, CommonEntrypoint[]>()

    context.entrypoints<CommonEntrypoint>().forEach(entrypoint => {
      const route = entrypoint.route.route
      if (route.type !== AppType.Backend || !queueRouteHelper.isQueueRoute(route)) {
        return
      }
      if (route.service != null && route.service !== context.cfg.service) {
        return
      }
      const { queue } = queueRouteHelper.queueRouteOptions(route)
      if (entrypoint.handle == null || !listen.includes(queue)) {
        return
      }

      served.set(queue, [...(served.get(queue) ?? []), entrypoint])
    })

    return served
  }

  const handle = async (job: JobContext<JobEnvelope>): Promise<JobReply> => {
    const envelope = job.data

    try {
      queueBridgeHelper.assertFresh(envelope, context.cfg.queue?.envelopeTtl)

      const entrypoint = context.entrypoint<CommonEntrypoint>(envelope.alias)
      if (entrypoint.handle == null) {
        throw new JobNotServed(envelope.alias)
      }

      const request = queueBridgeHelper.requestOf(envelope, entrypoint.path(), context, {
        id: job.id, name: job.name, queue: job.queue, attempt: job.attempt, touch: job.touch,
      })
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

        const entity = await makeEntityScope(request).attachEntity(context)
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

  const processor = (): JobProcessor<JobEnvelope, unknown> =>
    async (job: JobContext<JobEnvelope>) => await handle(job)

  return { served, processor, handle }
}

export const entrypointJobsOf = memoHelper.oncePer(makeEntrypointJobsHelper)
