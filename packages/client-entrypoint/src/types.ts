import type { ClientRouteModel, ClientRouteOptions } from '@owlmeans/client-route'
import type { AbstractRequest, CommonEntrypoint, CommonEntrypointOptions, EntrypointHandler, EntrypointOutcome } from '@owlmeans/entrypoint'

export interface ClientEntrypoint<T = {}, R extends ClientRequest = ClientRequest> extends CommonEntrypoint {
  route: ClientRouteModel
  /**
   * Address the entrypoint and resolve to what it answered. The reply's error is thrown, so a
   * caller that only needs the value never inspects an outcome.
   */
  call: EntrypointCall<T, R>
  /**
   * The same round trip as {@link ClientEntrypoint.call}, resolving to the value AND the outcome.
   * Use it only where the outcome decides what happens next.
   */
  invoke: EntrypointInvoke<T, R>
  /**
   * Build the URL this entrypoint addresses, with `:params` filled in and the query appended.
   * Absolute when the route belongs to another service, or when `absolute` is asked for.
   */
  url: EntrypointUrl<R>
  validate: EntrypointFilter<R>
  request: (request?: Partial<R>) => R
}

export interface EntrypointCall<T, Req extends ClientRequest = ClientRequest> {
  <Type extends T, R extends Req = Req>(req?: Partial<R>): Promise<Type>
}

export interface EntrypointInvoke<T, Req extends ClientRequest = ClientRequest> {
  <Type extends T, R extends Req = Req>(req?: Partial<R>): Promise<EntrypointReply<Type>>
}

export interface EntrypointReply<T> {
  value: T
  outcome: EntrypointOutcome
}

export interface EntrypointUrl<Req extends ClientRequest = ClientRequest> {
  <R extends Req = Req>(req?: Partial<R>, opts?: EntrypointUrlOptions): Promise<string>
}

export interface EntrypointUrlOptions {
  /** Force a fully qualified URL even when the route belongs to the current service. */
  absolute?: boolean
}

export interface EntrypointFilter<Req extends AbstractRequest = AbstractRequest> {
  <R extends Req>(req?: Partial<R>): Promise<boolean>
}

export interface ClientRequest<T extends {} = {}> extends AbstractRequest<T> {
}

export interface ClientEntrypointOptions extends CommonEntrypointOptions {
  routeOptions?: ClientRouteOptions
  validateOnCall?: boolean
}

export interface EntrypointRef<T, R extends AbstractRequest = AbstractRequest> {
  ref?: ClientEntrypoint<T, R>
}

export interface RefedEntrypointHandler<T, R extends AbstractRequest = AbstractRequest> {
  (ref: EntrypointRef<T, R>): EntrypointHandler
}
