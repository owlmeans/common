import { FORBIDDEN_ERROR, SERVER_ERROR, UNAUTHORIZED_ERROR } from '@owlmeans/api'
import type { FastifyReply } from 'fastify'
import { AccessError, AuthFailedError } from '../errors.js'
import { AuthForbidden, AuthorizationError } from '@owlmeans/auth'
import { ResilientError } from '@owlmeans/error'

/**
 * Map a thrown error onto an HTTP status.
 *
 * Two families reach here and both must be recognised. `AuthFailedError` / `AccessError` are this
 * package's own, raised by the request pipeline itself. `AuthorizationError` / `AuthForbidden`
 * come from `@owlmeans/auth` and are what the guards and gates actually throw — an unrecognised
 * one answers 500, which reports a refused request as a crashed server: the client cannot tell
 * "sign in again" from "the service is broken", and a consumer watching statuses concludes the
 * application fell over.
 *
 * **Order matters.** `AuthForbidden extends AuthorizationError`, so the 403 branch has to be
 * tested first or every refusal of a permission is reported as a failure to authenticate.
 */
export const handleError = (error: Error, reply: FastifyReply) => {
  let code: number = SERVER_ERROR
  if (error instanceof AuthForbidden || error instanceof AccessError) {
    // An established identity that lacks the permission. Re-authenticating changes nothing.
    code = FORBIDDEN_ERROR
  } else if (error instanceof AuthorizationError || error instanceof AuthFailedError) {
    // No usable credential — absent, expired, revoked, or naming a session this server no longer
    // holds. The caller is told to sign in, not that signing in would not help.
    code = UNAUTHORIZED_ERROR
  }
  if (!reply.sent) {
    reply.code(code).send(
      ResilientError.marshal(ResilientError.ensure(error as Error)).message
    )
  }
}
