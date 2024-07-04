import type { AbstractRequest } from '@owlmeans/module'
import type { Module } from '../types.js'

export type { Module as BasicModule, ModuleOptions as BasicModuleOptions } from '@owlmeans/module'
export type { Route as BasicRoute, RouteModel as BasicRouteModel } from '@owlmeans/route'

export interface ModuleRef<T, R extends AbstractRequest = AbstractRequest> { 
  ref?: Module<T, R>
}
