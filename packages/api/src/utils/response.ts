import { type AbstractResponse, EntrypointOutcome } from '@owlmeans/entrypoint'
import type { AxiosResponse } from 'axios'
import {
  ACCEPTED, CREATED, FINISHED, FORBIDDEN_ERROR, INCIDENT_ID_HEADER, DENIAL_KIND_HEADER,
  ACCESS_DENIED_KIND, OK, SERVER_ERROR, UNAUTHORIZED_ERROR,
} from '../consts.js'
import { ResilientError } from '@owlmeans/error'
import { ApiClientError, ApiStatusError, ServerAuthError, ServerCrashedError } from '../errors.js'
import { apiStatusHelper } from '../status/helper.js'
import type { ResponseStatusCarrier } from '../status/types.js'
import { logger } from '@owlmeans/log'
import type { ResponseUtils } from './response/types.js'

export const createResponseUtils = (): ResponseUtils => {
  const log = logger('api')

  const processResponse = (response: AxiosResponse, reply: AbstractResponse<any>): void => {
    switch (response.status) {
      case OK:
        reply.resolve(response.data, EntrypointOutcome.Ok)
        return
      case ACCEPTED:
        reply.resolve(response.data, EntrypointOutcome.Accepted)
        return
      case CREATED:
        return processEmptyResponse(response, reply, EntrypointOutcome.Created)
      case FINISHED:
        return processEmptyResponse(response, reply, EntrypointOutcome.Finished)
      default:
        // A refusal is ordinary traffic (401, 403, 409, 428): debug, and never the headers.
        log.debug('Request answered with a failure', {
          status: response.status, statusText: response.statusText, url: response.config?.url,
          incidentId: headerOf(response.headers, INCIDENT_ID_HEADER),
        })

        reply.reject(failureOf(response))
    }
  }

  /**
   * The error a non-2xx answer rejects with — always carrying the HTTP status and, when the server
   * sent one, its incident id.
   *
   * A development body is the marshaled `ResilientError`: it is rebuilt into its own class and
   * stamped with `responseStatus`. Anything else — the bare incident id of a production body, a
   * proxy's HTML, a framework's JSON — becomes the status error of {@link statusError}.
   */
  const failureOf = (response: AxiosResponse): Error => {
    const incidentId = headerOf(response.headers, INCIDENT_ID_HEADER)
      ?? (apiStatusHelper.isIncidentBody(response.data) ? response.data.trim() : undefined)
    const denialKind = response.status === FORBIDDEN_ERROR
      && headerOf(response.headers, DENIAL_KIND_HEADER) === ACCESS_DENIED_KIND
      ? ACCESS_DENIED_KIND : undefined

    if (typeof response.data === 'string' && response.data.includes(ResilientError.separator)) {
      try {
        const error = ResilientError.ensure(response.data, true)
        error.incidentId ??= incidentId
        Object.assign(error, {
          responseStatus: response.status, denialKind,
        } satisfies ResponseStatusCarrier)

        return error
      } catch {
        log.warn('Server returned an unrecognizable text error', { status: response.status, body: response.data })
      }
    }

    return Object.assign(statusError(response.status, incidentId), { denialKind })
  }

  /**
   * The typed error of a bare status: `ServerCrashedError` (500), `ServerAuthError` (401),
   * `ApiClientError('forbidden[:<id>]')` (403), `ApiStatusError` (`api:client:status:<n>[:<id>]`)
   * for every other one.
   */
  const statusError = (status: number, incidentId?: string): ApiClientError => {
    const error = status === SERVER_ERROR ? new ServerCrashedError(incidentId)
      : status === UNAUTHORIZED_ERROR ? new ServerAuthError(incidentId)
        : status === FORBIDDEN_ERROR ? new ApiClientError(incidentId != null ? `forbidden:${incidentId}` : 'forbidden')
          : new ApiStatusError(status, incidentId)
    if (incidentId != null) {
      error.incidentId = incidentId
    }

    return Object.assign(error, { responseStatus: status } satisfies ResponseStatusCarrier)
  }

  /** One response header, from an `AxiosHeaders` instance or a plain header object alike. */
  const headerOf = (headers: unknown, name: string): string | undefined => {
    if (headers == null || typeof headers !== 'object') {
      return undefined
    }
    const get = (headers as { get?: unknown }).get
    const viaGet = typeof get === 'function' ? get.call(headers, name) : undefined
    const value = viaGet ?? Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
    const first = Array.isArray(value) ? value[0] : value

    return typeof first === 'string' && first.trim() !== '' ? first.trim() : undefined
  }

  const processEmptyResponse = (response: AxiosResponse, reply: AbstractResponse<any>, outcome: EntrypointOutcome): void => {
    if (response.data != null && response.data != '') {
      reply.resolve(response.data, outcome)
      return
    }
    if (response.headers.toJSON != null && typeof response.headers.toJSON === 'function') {
      reply.resolve(response.headers.toJSON(), outcome)
      return
    }
    reply.resolve(response.headers, outcome)
  }

  return { processResponse, statusError }
}

export const responseUtils = createResponseUtils()
