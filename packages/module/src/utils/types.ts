import { RouteModel } from '@owlmeans/route'
import { ModuleOptions } from '../types.js'

export type { Module as BasicModule } from '@owlmeans/context'

export interface CreateModuleSignature<M> { 
  (route: RouteModel, opts?: ModuleOptions): M,
}
