import type { ClientRouteModel, ClientRouteOptions } from '@owlmeans/client-route'
import type { AbstractRequest, AbstractResponse, CommonModule, CommonModuleOptions, ModuleHandler, ModuleOutcome } from '@owlmeans/module'

export interface ClientModule<T, R extends AbstractRequest = AbstractRequest> extends CommonModule {
  route: ClientRouteModel
  call: ModuleCall<T, R>
  validate: ModuleFilter<R>
  getPath: (partial?: boolean) => string
  request: (request?: Partial<R>) => R
}

export interface ModuleCall<T, Req extends AbstractRequest = AbstractRequest> {
  <
    Type extends T, R extends Req = Req, P extends AbstractResponse<Type> = AbstractResponse<Type>
  >(req?: Partial<R>, res?: P): Promise<[T, ModuleOutcome]>
}

export interface ModuleFilter<Req extends AbstractRequest = AbstractRequest> {
  <R extends Req>(req?: Partial<R>): Promise<boolean>
}

export interface ClientModuleOptions extends CommonModuleOptions {
  force?: boolean
  routeOptions?: ClientRouteOptions
  validateOnCall?: boolean
}

export interface ModuleRef<T, R extends AbstractRequest = AbstractRequest> { 
  ref?: ClientModule<T, R>
}

export interface RefedModuleHandler<T, R extends AbstractRequest = AbstractRequest> {
  (ref: ModuleRef<T, R>): ModuleHandler
}
