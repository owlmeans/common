import type { RouteModel, RouteOptions } from '@owlmeans/client-route'
import type { BasicModule, BasicModuleOptions } from './utils/types.js'
import type { AbstractRequest, AbstractResponse, ModuleOutcome } from '@owlmeans/module'
import type { Context } from '@owlmeans/client-context'

export interface Module<T, R extends AbstractRequest = AbstractRequest> extends BasicModule {
  route: RouteModel
  call: ModuleCall<T, R>
  validate: ModuleFilter<R>
  getPath: (partial?: boolean) => string
}

export interface ModuleCall<T, Req extends AbstractRequest = AbstractRequest> {
  <
    Type extends T, R extends Req, P extends AbstractResponse<Type>, C extends Context
  >(ctx?: C, req?: Partial<R>, res?: P): Promise<[T, ModuleOutcome]>
}

export interface ModuleFilter<Req extends AbstractRequest = AbstractRequest> {
  <
    R extends Req, C extends Context
  >(ctx?: C, req?: Partial<R>): Promise<boolean>
}

export interface ModuleOptions extends BasicModuleOptions {
  force?: boolean
  routeOptions?: RouteOptions
  validateOnCall?: boolean
}
