import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { AxiosHeaders } from 'axios'
import type { AxiosResponse } from 'axios'
import type { AbstractResponse } from '@owlmeans/entrypoint'
import { EntrypointOutcome } from '@owlmeans/entrypoint'
import { ResilientError } from '@owlmeans/error'
import {
  ApiClientError, ApiStatusError, ServerAuthError, ServerCrashedError, httpStatusOf, incidentIdOf,
  INCIDENT_ID_HEADER,
} from '../src/index.js'
import { processResponse, statusError } from '../src/utils/handler.js'
import * as status from '../src/status/index.js'

const INCIDENT = '6f1c1a52-8a0e-4f5e-9a7c-1f2d3e4c5b6a'

class ConsentRequired extends ResilientError {
  public static override typeName = 'ApiSpecConsentRequired'
  public static httpStatus = 428

  constructor(message: string = 'error') {
    super(ConsentRequired.typeName, `spec:consent-required:${message}`)
  }
}
ResilientError.registerErrorClass(ConsentRequired)

class Unavailable extends ResilientError {
  public static override typeName = 'ApiSpecUnavailable'
  public static httpStatus = 503

  constructor(message: string = 'error') {
    super(Unavailable.typeName, message)
  }
}

const respond = (
  statusCode: number, data: unknown, headers: Record<string, string> | AxiosHeaders = {}
): AbstractResponse<unknown> => {
  const reply: AbstractResponse<unknown> = {
    resolve: (value, outcome) => { reply.value = value; reply.outcome = outcome },
    reject: error => { reply.error = error },
  }
  processResponse({
    status: statusCode, statusText: '', data, headers, config: { url: '/spec' },
  } as unknown as AxiosResponse, reply)

  return reply
}

const quiet = console.error
beforeAll(() => { console.error = () => {} })
afterAll(() => { console.error = quiet })

describe('2xx', () => {
  test('resolve exactly as before', () => {
    expect(respond(200, { ok: true })).toMatchObject({ value: { ok: true }, outcome: EntrypointOutcome.Ok })
    expect(respond(202, 'queued')).toMatchObject({ value: 'queued', outcome: EntrypointOutcome.Accepted })
    expect(respond(204, '', { 'x-a': '1' })).toMatchObject({ value: { 'x-a': '1' }, outcome: EntrypointOutcome.Finished })
  })
})

describe('a production incident body keeps its status and incident id', () => {
  test('428 with the header becomes ApiStatusError', () => {
    const { error } = respond(428, INCIDENT, { [INCIDENT_ID_HEADER.toLowerCase()]: INCIDENT })
    expect(error).toBeInstanceOf(ApiStatusError)
    expect(error!.message).toBe(`api:client:status:428:${INCIDENT}`)
    expect(httpStatusOf(error)).toBe(428)
    expect(incidentIdOf(error)).toBe(INCIDENT)
    expect((error as ApiStatusError).status).toBe(428)
  })

  test('the header is read from AxiosHeaders too, and the body alone suffices', () => {
    const headers = new AxiosHeaders({ [INCIDENT_ID_HEADER]: INCIDENT })
    expect(incidentIdOf(respond(409, 'x', headers).error)).toBe(INCIDENT)
    expect(incidentIdOf(respond(402, INCIDENT).error)).toBe(INCIDENT)
    expect(httpStatusOf(respond(402, INCIDENT).error)).toBe(402)
  })

  test('500, 401 and 403 keep their classes and markers', () => {
    const crashed = respond(500, INCIDENT).error
    expect(crashed).toBeInstanceOf(ServerCrashedError)
    expect(crashed!.message).toBe(`api:client:crashed:${INCIDENT}`)
    expect(httpStatusOf(crashed)).toBe(500)

    const auth = respond(401, INCIDENT).error
    expect(auth).toBeInstanceOf(ServerAuthError)
    expect(auth!.message).toBe(`api:client:auth:${INCIDENT}`)
    expect(httpStatusOf(auth)).toBe(401)

    const forbidden = respond(403, INCIDENT).error
    expect(forbidden).toBeInstanceOf(ApiClientError)
    expect(forbidden).not.toBeInstanceOf(ApiStatusError)
    expect(forbidden!.message).toBe(`api:client:forbidden:${INCIDENT}`)
    expect(httpStatusOf(forbidden)).toBe(403)
  })

  test('without an incident id the markers stay as before', () => {
    expect(statusError(500).message).toBe('api:client:crashed:error')
    expect(statusError(403).message).toBe('api:client:forbidden')
    expect(incidentIdOf(statusError(500))).toBeNull()
    expect(statusError(418).message).toBe('api:client:status:418')
  })

  test('a proxy HTML page or framework JSON becomes a status error', () => {
    const html = respond(502, '<html><body>Bad Gateway</body></html>').error
    expect(html).toBeInstanceOf(ApiStatusError)
    expect(httpStatusOf(html)).toBe(502)
    expect(incidentIdOf(html)).toBeNull()

    const json = respond(400, { statusCode: 400, error: 'Bad Request', message: 'body/x' }).error
    expect(json).toBeInstanceOf(ApiStatusError)
    expect(httpStatusOf(json)).toBe(400)
  })

  test('no class declares a static httpStatus, so a rethrow upstream stays 500', () => {
    for (const error of [statusError(428), statusError(500), statusError(401), statusError(403)]) {
      expect((error.constructor as { httpStatus?: unknown }).httpStatus).toBeUndefined()
    }
  })
})

describe('a development body stays its typed class', () => {
  test('rebuilt with responseStatus and incident id', () => {
    const body = ResilientError.marshal(new ConsentRequired('2'), { includeStack: true, incidentId: INCIDENT }).message
    const { error } = respond(428, body, { [INCIDENT_ID_HEADER]: INCIDENT })
    expect(error).toBeInstanceOf(ConsentRequired)
    expect(error!.message).toBe('spec:consent-required:2')
    expect((error as { responseStatus?: number }).responseStatus).toBe(428)
    expect(httpStatusOf(error)).toBe(428)
    expect(incidentIdOf(error)).toBe(INCIDENT)
  })

  test('a typed api error keeps its marker fields', () => {
    const body = ResilientError.marshal(new ApiStatusError(409, INCIDENT)).message
    const error = respond(409, body).error as ApiStatusError
    expect(error).toBeInstanceOf(ApiStatusError)
    expect(error.status).toBe(409)
    expect(error.incidentId).toBe(INCIDENT)
  })
})

describe('marshal round trips', () => {
  const roundTrip = (error: Error): ResilientError => ResilientError.ensure(ResilientError.marshal(error))

  test('keep status and incident id of every client error', () => {
    const cases: Array<[ApiClientError, number]> = [
      [new ApiStatusError(428, INCIDENT), 428],
      [new ServerCrashedError(INCIDENT), 500],
      [new ServerAuthError(INCIDENT), 401],
      [new ApiClientError(`forbidden:${INCIDENT}`), 403],
    ]
    for (const [error, code] of cases) {
      const back = roundTrip(error)
      expect(back.constructor).toBe(error.constructor)
      expect((back as ApiClientError).status).toBe(code)
      expect(httpStatusOf(back)).toBe(code)
      expect(incidentIdOf(back)).toBe(INCIDENT)
    }
  })

  test('a legacy bare-status marker still reads', () => {
    expect(httpStatusOf(new ApiClientError('404'))).toBe(404)
  })
})

describe('./status', () => {
  test('a declared static 428 answers without any marker; an undeclared 5xx does not', () => {
    expect(status.httpStatusOf(new ConsentRequired())).toBe(428)
    expect(status.httpStatusOf(new Unavailable())).toBeNull()
    expect(status.httpStatusOf(new Error('plain'))).toBeNull()
    expect(status.httpStatusOf(null)).toBeNull()
  })

  test('reads a marker from a plain error message or a type', () => {
    expect(status.httpStatusOf(new Error(`${status.API_STATUS_MARKER}428:${INCIDENT}`))).toBe(428)
    expect(status.httpStatusOf({ type: 'api:client:auth:error' })).toBe(401)
    expect(status.incidentIdOf(new Error(`api:client:crashed:${INCIDENT}`))).toBe(INCIDENT)
  })

  test('isIncidentBody accepts a bare incident UUID only', () => {
    expect(status.isIncidentBody(INCIDENT)).toBe(true)
    expect(status.isIncidentBody(`${INCIDENT}\n`)).toBe(true)
    expect(status.isIncidentBody('Unauthorized')).toBe(false)
    expect(status.isIncidentBody(`ApiError|||api:x|||${INCIDENT}`)).toBe(false)
    expect(status.isIncidentBody({ id: INCIDENT })).toBe(false)
  })
})
