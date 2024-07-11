import type { CommonRouteModel } from '@owlmeans/route'
import type { InitializedService, LazyService, BasicModule } from '@owlmeans/context'
import type { JSONSchemaType } from 'ajv'
import type { ModuleOutcome } from './consts.js'
import type { Auth } from '@owlmeans/auth'

export interface CommonModule extends BasicModule {
  route: CommonRouteModel
  /**
   * @property {boolean} - if true — router attaches this module unconditionaly 
   * @default false
   */
  sticky: boolean
  filter?: Filter
  guards?: string[]
  gate?: string
  handle?: ModuleHandler
  getAlias: () => string
  getPath: () => string
  getParentAlias: () => string | null
  hasParent: () => boolean
  resolve: <M extends CommonModule>() => Promise<M>
  getParent: <M extends CommonModule>() => M
  setService: (service: string) => void
  getGuards: () => string[]
}

export interface CommonModuleOptions extends Partial<CommonModule> { }

export interface ModuleMatch {
  <R extends AbstractRequest, P extends AbstractResponse<any>>(req: R, res: P): Promise<boolean>
}

export interface ModuleHandler {
  <
    T, R extends AbstractRequest = AbstractRequest,
    P extends AbstractResponse<any> = AbstractResponse<any>,
  >(req: R, res: P): T | Promise<T>
}

export interface ModuleAssert {
  <R extends AbstractRequest, P extends AbstractResponse<any>>(req: R, res: P): Promise<void>
}

export interface AbstractRequest<T extends {} = {}> {
  alias: string
  auth?: Auth
  params: Record<string, string | number | undefined | null> | Partial<T>
  body?: Record<string, any> | Partial<T>
  headers: Record<string, string[] | string | undefined>
  query: Record<string, string | number | undefined | null> | Partial<T> | Object
  path: string
  original?: any
  canceled?: boolean
  cancel?: () => void
}

export interface AbstractResponse<T> {
  responseProvider?: unknown
  value?: T,
  outcome?: ModuleOutcome
  error?: Error
  resolve: (value: T, outcome?: ModuleOutcome) => void
  reject: (error: Error) => void
}

export interface GuardService extends InitializedService {
  match: ModuleMatch
  handle: ModuleHandler
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
