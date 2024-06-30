import type { RouteModel } from '@owlmeans/server-route'
import type { BasicModule } from './utils/types.js'
import type { ModuleHandler } from '@owlmeans/module'
import type { JSONSchemaType } from 'ajv'
import type { Service } from '@owlmeans/context'

export interface Module<R> extends BasicModule {
  filter?: Filter
  route: RouteModel<R>
  fixer?: string
  handler: ModuleHandler
}

export interface FixerService extends Service {
  handle: <R>(reply: R, error: Error) => void
}

export interface Filter<B = undefined, P = undefined, H = undefined, R = undefined, Q = undefined> {
  query: Q extends {} ? JSONSchemaType<Q> : undefined
  params: P extends {} ? JSONSchemaType<P> : undefined
  body: B extends {} ? JSONSchemaType<B> : undefined
  response: R extends {} ? JSONSchemaType<R> : undefined
  headers: H extends {} ? JSONSchemaType<R> : undefined
}
