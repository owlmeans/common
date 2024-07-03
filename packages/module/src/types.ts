import type { RouteModel } from '@owlmeans/route'
import type { Context, InitializedService, LazyService } from '@owlmeans/context'
import type { BasicModule } from './utils/types.js'
import type { JSONSchemaType } from 'ajv'
import type { ModuleOutcome } from './consts.js'

export interface Module extends BasicModule {
  route: RouteModel
  filter?: Filter
  guards?: string[]
  gate?: string
  handler?: ModuleHandler
  getAlias: () => string
  getPath: () => string
  getParentAlias: () => string | null
  hasParent: () => boolean
}

export interface ModuleOptions extends Partial<Module> { }

export interface ModuleMatch {
  <R extends AbstractRequest, P extends AbstractResponse<any>, C extends Context>(req: R, res: P, ctx: C): Promise<boolean>
}

export interface ModuleHandler {
  <
    T, R extends AbstractRequest = AbstractRequest,
    P extends AbstractResponse<any> = AbstractResponse<any>,
    C extends Context = Context
  >(req: R, res: P, ctx: C): T | Promise<T>
}

export interface ModuleAssert {
  <R extends AbstractRequest, P extends AbstractResponse<any>, C extends Context>(req: R, res: P, ctx: C): Promise<void>
}

export interface AbstractRequest {
  alias: string
  params: Record<string, string | number | undefined | null>
  body?: Record<string, any>
  headers: Record<string, string[] | string | undefined>
  query: Record<string, string | number | undefined | null>
  path: string
  original?: any
}

export interface AbstractResponse<T> {
  value?: T,
  outcome?: ModuleOutcome
  error?: Error
  resolve: (value: T, outcome?: ModuleOutcome) => void
  reject: (error: Error) => void
}

export interface GuardService extends InitializedService {
  match: ModuleMatch
  hanlder: ModuleMatch
}

export interface GateService extends LazyService {
  /**
   * @throws {Error}
   */
  assert: ModuleAssert
}

export interface Filter {
  query?: JSONSchemaType<any>
  params?: JSONSchemaType<any>
  body?: JSONSchemaType<any>
  response?: JSONSchemaType<any>
  headers?: JSONSchemaType<any>
}
