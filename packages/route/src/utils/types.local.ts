import type { BasicConfig, Contextual } from '@owlmeans/context'
import type { RouteModel } from '../types.js'

export type Config = BasicConfig

/** What an entrypoint looks like from the route layer: something that carries a route model. */
export interface RouteCarrier extends Contextual {
  _entrypoint: true
  route: RouteModel
}
