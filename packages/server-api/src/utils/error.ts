import { FORBIDDEN_ERROR, SERVER_ERROR, UNAUTHORIZED_ERROR } from '@owlmeans/api'
import type { FastifyReply } from 'fastify'
import { AccessError, AuthFailedError } from '../errors.js'
import { AuthForbidden, AuthorizationError } from '@owlmeans/auth'
import { ResilientError } from '@owlmeans/error'

/**
 * What an error class may declare about the HTTP status it is answered with.
 *
 * Structural on purpose: the classes that declare it live in packages that must not depend on an
 * HTTP server (`@owlmeans/payment`, a product's contract package), so they write a plain
 * `public static httpStatus = 409` and nothing imports this type.
 */
export interface HttpStatusDeclaration {
  httpStatus?: unknown
}

const CLIENT_ERROR_FIRST = 400
const CLIENT_ERROR_LAST = 499

/**
 * The 4xx status an error's class declares, or `null` when it declares none that may be honoured.
 *
 * Read through the constructor chain — a static property is inherited, so a subclass answers what
 * its nearest declaring ancestor says, and redeclares to change it. Only an integer 4xx is honoured:
 * a declaration is how a class says "this is the caller's condition, not a fault", and a 5xx, a 2xx,
 * a string or a fraction says nothing a boundary can act on. The read is structural, so a class from
 * a duplicate module copy declares exactly what the imported one does.
 */
export const declaredErrorStatus = (error: unknown): number | null => {
  if (error == null || typeof error !== 'object') {
    return null
  }
  const status = (error.constructor as HttpStatusDeclaration | undefined)?.httpStatus
  if (typeof status !== 'number' || !Number.isInteger(status)
    || status < CLIENT_ERROR_FIRST || status > CLIENT_ERROR_LAST) {
    return null
  }

  return status
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

/**
 * The HTTP status an error is answered with, read off the error exactly as given.
 *
 * Two families reach here and both must be recognised. `AuthFailedError` / `AccessError` are this
 * package's own, raised by the request pipeline itself. `AuthorizationError` / `AuthForbidden`
 * come from `@owlmeans/auth` and are what the guards and gates actually throw — an unrecognised
 * one answers 500, which reports a refused request as a crashed server: the client cannot tell
 * "sign in again" from "the service is broken", and a consumer watching statuses concludes the
 * application fell over. A family member is recognised by class OR by registered type name
 * ({@link typeNamesOf}), so a class from a duplicate module copy answers the same status.
 *
 * **Order matters.** `AuthForbidden extends AuthorizationError`, so the 403 branch has to be
 * tested first or every refusal of a permission is reported as a failure to authenticate. Both
 * auth branches come before a class's own declaration, so an auth refusal can never be restated
 * as something else. Everything that is neither an auth error nor a class declaring a 4xx
 * {@link declaredErrorStatus} answers 500.
 */
export const errorStatus = (error: unknown): number => {
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

/**
 * Answer a thrown error: a status, and the marshalled `ResilientError` as the body.
 *
 * The status is resolved in two steps. The error AS THROWN comes first: it is the one object whose
 * class is certainly the class that was raised, while `ResilientError.ensure` rebuilds through the
 * registry of whichever `@owlmeans/error` copy this module loaded — under duplicate module copies
 * that turns a perfectly recognisable auth refusal into a plain `ResilientError` answering 500.
 * Only when the thrown error answers 500 is the ENSURED error asked, because the rebuild is what
 * gives a status to a marshalled error that crossed a hop as a plain `Error`.
 */
export const handleError = (error: Error, reply: FastifyReply) => {
  if (!reply.sent) {
    const resilient = ResilientError.ensure(error as Error)
    const thrown = errorStatus(error)
    reply.code(thrown !== SERVER_ERROR ? thrown : errorStatus(resilient))
      .send(ResilientError.marshal(resilient).message)
  }
}
