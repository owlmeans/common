import {
  FORBIDDEN_ERROR, SERVER_ERROR, UNAUTHORIZED_ERROR, DENIAL_KIND_HEADER, ACCESS_DENIED_KIND,
} from '@owlmeans/api'
import type { FastifyReply } from 'fastify'
import { AccessError, AuthFailedError } from '../errors.js'
import { AuthForbidden, AuthorizationError } from '@owlmeans/auth'
import { isResilientError, ResilientError, SEPARATOR } from '@owlmeans/error'
import { randomUUID } from 'node:crypto'
import { logger } from '@owlmeans/log'
import type { Config, HttpErrorExposure } from '../types.js'
import { CLIENT_ERROR_FIRST, CLIENT_ERROR_LAST, SERVER_ERROR_FIRST, SERVER_ERROR_LAST } from './consts.local.js'
import { INCIDENT_ID_HEADER } from './consts.js'
import type { HttpStatusDeclaration, SerializedHttpError } from './types.js'
import type { HttpErrorHelper } from './error/types.js'

export const createHttpErrorHelper = (): HttpErrorHelper => {
  const declaredErrorStatus = (error: unknown): number | null => {
    if (error == null || typeof error !== 'object') {
      return null
    }
    const declaration = error.constructor as HttpStatusDeclaration | undefined
    const status = declaration?.httpStatus
    if (typeof status !== 'number' || !Number.isInteger(status)) {
      return null
    }
    if (status >= CLIENT_ERROR_FIRST && status <= CLIENT_ERROR_LAST) return status
    if (status >= SERVER_ERROR_FIRST && status <= SERVER_ERROR_LAST
      && declaration?.allowServerErrorStatus === true) return status

    return null
  }

  /**
   * The registered type names an error carries: its own `type`, and the static `typeName` of every
   * class on its constructor chain.
   *
   * This is how a class is recognised when `instanceof` cannot see it. A process that loads a package
   * twice — `bun --preserve-symlinks` over a linked workspace resolves one package through several
   * `node_modules` paths — holds several copies of every error class, and an error built by one copy
   * is not an instance of another. The registered names are the same in every copy. A subclass's
   * `typeName` does not reliably embed its parent's (`EntitlementRefusal` extends `AuthForbidden`), so
   * a family is recognised by walking the chain and matching names exactly, never by a substring.
   */
  const typeNamesOf = (error: object): Set<string> => {
    const names = new Set<string>()
    const type = (error as { type?: unknown }).type
    if (typeof type === 'string') {
      names.add(type)
    }
    let ctor: unknown = error.constructor
    while (typeof ctor === 'function') {
      const name = (ctor as { typeName?: unknown }).typeName
      if (typeof name === 'string') {
        names.add(name)
      }
      ctor = Object.getPrototypeOf(ctor)
    }

    return names
  }

  const isOfFamily = (names: Set<string>, family: string[]): boolean =>
    family.some(typeName => names.has(typeName))

  const errorStatus = (error: unknown): number => {
    if (error == null || typeof error !== 'object') {
      return SERVER_ERROR
    }
    const names = typeNamesOf(error)
    if (error instanceof AuthForbidden || error instanceof AccessError
      || isOfFamily(names, [AuthForbidden.typeName, AccessError.typeName])) {
      // An established identity that lacks the permission. Re-authenticating changes nothing.
      return FORBIDDEN_ERROR
    }
    if (error instanceof AuthorizationError || error instanceof AuthFailedError
      || isOfFamily(names, [AuthorizationError.typeName, AuthFailedError.typeName])) {
      // No usable credential — absent, expired, revoked, or naming a session this server no longer
      // holds. The caller is told to sign in, not that signing in would not help.
      return UNAUTHORIZED_ERROR
    }

    return declaredErrorStatus(error) ?? SERVER_ERROR
  }

  const errorExposure = (config?: Pick<Config, 'http'>): HttpErrorExposure =>
    config?.http?.errors?.exposure === 'development' ? 'development' : 'production'

  /**
   * Preserve a typed/marshalled error when possible without asking `ensure` to convert a plain
   * error. In particular, `ensure` deliberately rethrows SyntaxError; an HTTP boundary still has
   * to serialize it safely and let the incident log retain the original object.
   */
  const normalizeForWire = (error: Error): Error => {
    if (error instanceof SyntaxError || isResilientError(error)) {
      return error
    }
    if (error.message.includes(SEPARATOR)) {
      const ensured = ResilientError.ensure(error)
      // The catch-all converter's legacy constructor shape shifts an ordinary error's fields.
      // Only keep `ensure`'s result when a registered wire prefix actually rebuilt something.
      if (ensured.type !== error.message || ensured.message !== error.stack) {
        return ensured
      }
    }
    return error
  }

  const serializeError = (
    error: Error, exposure: HttpErrorExposure = 'production'
  ): SerializedHttpError => {
    const normalized = normalizeForWire(error)
    const thrown = errorStatus(error)
    const status = thrown !== SERVER_ERROR ? thrown : errorStatus(normalized)
    const incidentId = randomUUID()
    // The server log owns every diagnostic. Production callers receive only its correlation key;
    // development keeps the typed wire form so local clients can retain their usual error details.
    Object.assign(error, { incidentId })
    if (isResilientError(normalized)) normalized.incidentId = incidentId
    const body = exposure === 'production'
      ? incidentId
      : ResilientError.marshal(normalized, { includeStack: true, incidentId }).message

    return { status, body, incidentId }
  }

  const applyErrorHeaders = (error: unknown, reply: FastifyReply): void => {
    if (error == null || typeof error !== 'object') {
      return
    }
    const retryAfter = (error as { retryAfter?: unknown }).retryAfter
    if (typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0) {
      reply.header('Retry-After', String(Math.ceil(retryAfter)))
    }
    // Match exact registered types. EntitlementRefusal also extends AuthForbidden but is a plan
    // decision, not a person's IAM permission denial.
    const type = (error as { type?: unknown }).type
    if (type === AuthForbidden.typeName || type === AccessError.typeName) {
      reply.header(DENIAL_KIND_HEADER, ACCESS_DENIED_KIND)
    }
  }

  const http = logger('http')

  /**
   * The one log entry of a failed request, by what the failure means:
   *
   * | Status | Level | Why |
   * |---|---|---|
   * | 5xx | error | a fault — the one entry that owns type, message and stack, keyed by the incident id |
   * | 403 | warn, `access.forbidden` | an established identity was refused; worth an operator's eye |
   * | 401 | debug, `auth.refused` | an absent or expired credential is the ordinary shape of a sign-in |
   * | other 4xx | debug | the caller's mistake, not the server's |
   *
   * The method and path are logged; the query string is not — it can carry a token.
   */
  const logFailure = (error: Error, reply: FastifyReply, status: number, incidentId: string): void => {
    const request = reply.request
    const where = { method: request?.method, path: request?.url?.split('?')[0], status, incidentId }
    if (status >= SERVER_ERROR) {
      http.error('Request failed', { err: error, ...where })
    } else if (status === FORBIDDEN_ERROR) {
      http.warn('Access forbidden', { type: (error as { type?: unknown }).type, message: error.message, ...where },
        { event: 'access.forbidden' })
    } else if (status === UNAUTHORIZED_ERROR) {
      http.debug('Authentication refused', { message: error.message, ...where }, { event: 'auth.refused' })
    } else {
      http.debug('Request refused', { message: error.message, ...where })
    }
  }

  const handleError = (
    error: Error, reply: FastifyReply, exposure: HttpErrorExposure = 'production'
  ): void => {
    if (!reply.sent) {
      const serialized = serializeError(error, exposure)
      applyErrorHeaders(error, reply)
      logFailure(error, reply, serialized.status, serialized.incidentId)
      reply.header(INCIDENT_ID_HEADER, serialized.incidentId)
        .code(serialized.status)
        .send(serialized.body)
    }
  }

  return { declaredErrorStatus, errorStatus, errorExposure, serializeError, applyErrorHeaders, handleError }
}

export const httpErrorHelper = createHttpErrorHelper()

/** @deprecated compat:factory-refactor — use `httpErrorHelper.errorStatus(…)` */
export const errorStatus = (error: unknown): number => httpErrorHelper.errorStatus(error)
