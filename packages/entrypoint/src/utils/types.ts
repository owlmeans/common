import { CommonRouteModel } from '@owlmeans/route'
import { CommonEntrypointOptions } from '../types.js'

export interface CreateEntrypointSignature<M> {
  (route: CommonRouteModel, opts?: CommonEntrypointOptions): M,
}
