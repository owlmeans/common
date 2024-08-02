import type { ServerRouteModel, ServerRouteOptions } from '@owlmeans/server-route'
import type { CommonModule, ModuleHandler, CommonModuleOptions } from '@owlmeans/module'
import type { Service } from '@owlmeans/context'

export interface ServerModule<R> extends CommonModule {
  route: ServerRouteModel<R>
  fixer?: string
  handle: ModuleHandler
}

export interface ModuleOptions<R> extends CommonModuleOptions {
  /**
   * Force module to be elevated even if it is already elevated
   */
  force?: boolean
  fixer?: string
  intermediate?: boolean
  routeOptions?: ServerRouteOptions<R>
}

export interface FixerService extends Service {
  handle: <R>(reply: R, error: Error) => void
}

export interface ModuleRef<R> { 
  ref?: ServerModule<R>
}

export interface RefedModuleHandler<R> {
  (ref: ModuleRef<R>): ModuleHandler
}
