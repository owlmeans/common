import { RouteModel } from '@owlmeans/route'
import { CommonEntrypointOptions } from '../types.js'

export interface CreateEntrypointSignature<M> {
  (route: RouteModel, opts?: CommonEntrypointOptions): M,
}
