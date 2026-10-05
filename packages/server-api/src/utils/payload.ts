import { EntrypointOutcome } from '@owlmeans/entrypoint'
import type { AbstractResponse, AbstractRequest } from '@owlmeans/entrypoint'
import type { Request, Response } from '../types.js'
import { ACCEPTED, CREATED, OK } from '@owlmeans/api'
import { httpErrorHelper } from './error.js'
import type { PayloadHelper } from './payload/types.js'

export const createPayloadHelper = (): PayloadHelper => {
  const provideRequest = (alias: string, req: Request, provision?: boolean): AbstractRequest => {
    provision = provision ?? false
    return {
      alias,
      auth: (req as any)._auth ?? undefined,
      // Resolved once by `authorize` and carried by reference, exactly like `_auth`, so a handler
      // reached through any path sees the same entity the guard admitted.
      entity: (req as any)._entity ?? undefined,
      params: req.params as Record<string, string | number | undefined | null>,
      body: req.body as Record<string, any>,
      headers: req.headers,
      query: req.query as Record<string, string | number | undefined | null>,
      path: req.url,
      original: provision ? req : undefined
    }
  }

  const executeResponse = <T>(response: AbstractResponse<T>, reply: Response, throwOnError?: boolean): boolean => {
    if (response.error != null) {
      if (throwOnError ?? false) {
        throw response.error
      }
      httpErrorHelper.handleError(response.error, reply)
      return true
    } else if (response.outcome != null) {
      switch (response.outcome) {
        case EntrypointOutcome.Accepted:
          reply.code(ACCEPTED).send(response.value)
          break
        case EntrypointOutcome.Created:
          reply.code(CREATED).send(response.value)
          break
        case EntrypointOutcome.Ok:
        default:
          reply.code(OK).send(response.value)
      }
      return true
    }

    return false
  }

  return { provideRequest, executeResponse }
}

export const payloadHelper = createPayloadHelper()
