import type { RouteModel, RouteOptions } from '@owlmeans/client-route'
import type { BasicModule, BasicModuleOptions } from './utils/types.js'
import type { AbstractRequest, AbstractResponse, ModuleHandler, ModuleOutcome } from '@owlmeans/module'

export interface Module<T, R extends AbstractRequest = AbstractRequest> extends BasicModule {
  route: RouteModel
  call: ModuleCall<T, R>
  validate: ModuleFilter<R>
  getPath: (partial?: boolean) => string
}

export interface ModuleCall<T, Req extends AbstractRequest = AbstractRequest> {
  <
    Type extends T, R extends Req, P extends AbstractResponse<Type>
  >(req?: Partial<R>, res?: P): Promise<[T, ModuleOutcome]>
}

export interface ModuleFilter<Req extends AbstractRequest = AbstractRequest> {
  <R extends Req>(req?: Partial<R>): Promise<boolean>
}

export interface ModuleOptions extends BasicModuleOptions {
  force?: boolean
  routeOptions?: RouteOptions
  validateOnCall?: boolean
}

export interface ModuleRef<T, R extends AbstractRequest = AbstractRequest> { 
  ref?: Module<T, R>
}

export interface RefedModuleHandler<T, R extends AbstractRequest = AbstractRequest> {
  (ref: ModuleRef<T, R>): ModuleHandler
}
