import type { ClientRouteModel, ClientRouteOptions } from '@owlmeans/client-route'
import type { AbstractRequest, AbstractResponse, CommonEntrypoint, CommonEntrypointOptions, EntrypointHandler, EntrypointOutcome } from '@owlmeans/entrypoint'

export interface ClientEntrypoint<T = {}, R extends ClientRequest = ClientRequest> extends CommonEntrypoint {
  route: ClientRouteModel
  call: EntrypointCall<T, R>
  validate: EntrypointFilter<R>
  getPath: (partial?: boolean) => string
  request: (request?: Partial<R>) => R
}

export interface EntrypointCall<T, Req extends ClientRequest = ClientRequest> {
  <
    Type extends T, R extends Req = Req, P extends AbstractResponse<Type> = AbstractResponse<Type>
  >(req?: Partial<R>, res?: P): Promise<[Type, EntrypointOutcome]>
}

export interface EntrypointFilter<Req extends AbstractRequest = AbstractRequest> {
  <R extends Req>(req?: Partial<R>): Promise<boolean>
}

export interface ClientRequest<T extends {} = {}> extends AbstractRequest<T> {
  full?: boolean
}

export interface ClientEntrypointOptions extends CommonEntrypointOptions {
  /**
   * Force entrypoint to be elevated even if it is already elevated
   */
  force?: boolean
  routeOptions?: ClientRouteOptions
  validateOnCall?: boolean
}

export interface EntrypointRef<T, R extends AbstractRequest = AbstractRequest> {
  ref?: ClientEntrypoint<T, R>
}

export interface RefedEntrypointHandler<T, R extends AbstractRequest = AbstractRequest> {
  (ref: EntrypointRef<T, R>): EntrypointHandler
}
