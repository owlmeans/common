import type { RouteModel, RouteOptions } from '@owlmeans/client-route'
import type { BasicModule, BasicModuleOptions } from './utils/types.js'
import type { AbstractRequest, AbstractResponse, ModuleOutcome } from '@owlmeans/module'
import type { Context } from '@owlmeans/client-context'

export interface Module<T, R extends AbstractRequest = AbstractRequest> extends BasicModule {
  route: RouteModel
  call: ModuleCall<T, R>
}

export interface ModuleCall<T, Req extends AbstractRequest = AbstractRequest> {
  <
    Type extends T, R extends Req, P extends AbstractResponse<Type>, C extends Context
  >(ctx?: C, req?: Partial<R>, res?: P): Promise<[T | null, ModuleOutcome] | void>
}

export interface ModuleOptions extends BasicModuleOptions {
  routeOptions?: RouteOptions
}
