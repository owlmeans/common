import type { AbstractRequest, AbstractResponse } from '@owlmeans/entrypoint'
import type { Request, Response } from '../../types.js'

/** Moves an exchange between Fastify and the entrypoint shapes: the request in, the response out. */
export interface PayloadHelper {
  /** The entrypoint request of a Fastify request; `provision` keeps the original on it. */
  provideRequest: (alias: string, req: Request, provision?: boolean) => AbstractRequest
  /**
   * Emits the response onto the fastify reply if the handler produced an
   * error or an outcome. Returns `true` when something was actually sent so
   * callers don't rely on `reply.sent`, which in fastify v5 only flips once
   * the raw socket finishes writing (asynchronously) and therefore reads
   * `false` synchronously right after `reply.send()`.
   *
   * @throws {Error}
   */
  executeResponse: <T>(response: AbstractResponse<T>, reply: Response, throwOnError?: boolean) => boolean
}
