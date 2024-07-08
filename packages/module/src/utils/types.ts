import { CommonRouteModel } from '@owlmeans/route'
import { CommonModuleOptions } from '../types.js'

export interface CreateModuleSignature<M> { 
  (route: CommonRouteModel, opts?: CommonModuleOptions): M,
}
