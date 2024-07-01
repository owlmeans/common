import type { RouteModel, RouteOptions } from '@owlmeans/server-route'
import type { BasicModule, BasicModuleOptions } from './utils/types.js'
import type { ModuleHandler } from '@owlmeans/module'
import type { Service } from '@owlmeans/context'

export interface Module<R> extends BasicModule {
  route: RouteModel<R>
  fixer?: string
  handler: ModuleHandler
}

export interface ModuleOptions<R> extends BasicModuleOptions {
  fixer?: string
  intermediate?: boolean
  routeOptions?: RouteOptions<R>
}

export interface FixerService extends Service {
  handle: <R>(reply: R, error: Error) => void
}
