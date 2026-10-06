import type { FastifyReply } from 'fastify'
import type { Config, HttpErrorExposure } from '../../types.js'
import type { SerializedHttpError } from '../types.js'

/** How the HTTP boundary answers a thrown error: its status, its wire body, its headers and its log entry. */
export interface HttpErrorHelper {
  /**
   * The HTTP status an error's class declares, or `null` when it declares none that may be honoured.
   *
   * Read through the constructor chain — a static property is inherited, so a subclass answers what
   * its nearest declaring ancestor says, and redeclares to change it. An integer 4xx is honoured
   * directly. A 5xx is honoured only with `allowServerErrorStatus = true`, so a domain class must
   * explicitly opt in to exposing a precise availability response. The read is structural, so a
   * class from a duplicate module copy declares exactly what the imported one does.
   */
  declaredErrorStatus: (error: unknown) => number | null
  /**
   * The HTTP status an error is answered with, read off the error exactly as given.
   *
   * Two families reach here and both must be recognised. `AuthFailedError` / `AccessError` are this
   * package's own, raised by the request pipeline itself. `AuthorizationError` / `AuthForbidden`
   * come from `@owlmeans/auth` and are what the guards and gates actually throw — an unrecognised
   * one answers 500, which reports a refused request as a crashed server: the client cannot tell
   * "sign in again" from "the service is broken", and a consumer watching statuses concludes the
   * application fell over. A family member is recognised by class OR by registered type name, so a
   * class from a duplicate module copy answers the same status.
   *
   * **Order matters.** `AuthForbidden extends AuthorizationError`, so the 403 branch has to be
   * tested first or every refusal of a permission is reported as a failure to authenticate. Both
   * auth branches come before a class's own declaration, so an auth refusal can never be restated
   * as something else. Everything that is neither an auth error nor a class declaring an allowed
   * {@link HttpErrorHelper.declaredErrorStatus} answers 500.
   */
  errorStatus: (error: unknown) => number
  /** Invalid or absent configuration always resolves to the production-safe policy. */
  errorExposure: (config?: Pick<Config, 'http'>) => HttpErrorExposure
  /** One central wire shape for every server error. */
  serializeError: (error: Error, exposure?: HttpErrorExposure) => SerializedHttpError
  /** Apply safe response metadata carried by an error without coupling its package to Fastify. */
  applyErrorHeaders: (error: unknown, reply: FastifyReply) => void
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
  handleError: (error: Error, reply: FastifyReply, exposure?: HttpErrorExposure) => void
}
