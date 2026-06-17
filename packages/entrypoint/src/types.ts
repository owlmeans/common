import type { CommonRouteModel } from '@owlmeans/route'
import type { InitializedService, LazyService, BasicEntrypoint } from '@owlmeans/context'
import type { AnySchemaObject } from 'ajv'
import type { EntrypointOutcome } from './consts.js'
import type { Auth } from '@owlmeans/auth'

export interface CommonEntrypoint extends BasicEntrypoint {
  route: CommonRouteModel
  /**
   * @property {boolean} - if true — router attaches this entrypoint unconditionally
   * @default false
   */
  sticky: boolean
  filter?: Filter
  guards?: string[]
  gate?: string
  gateParams?: string | string[]
  handle?: EntrypointHandler
  getAlias: () => string
  getPath: () => string
  getParentAlias: () => string | null
  hasParent: () => boolean
  resolve: <M extends CommonEntrypoint>() => Promise<M>
  getParent: <M extends CommonEntrypoint>() => M
  setService: (service: string) => void
  getGuards: () => string[]
  getGates: () => [string, string[]][]
}

export interface CommonEntrypointOptions extends Partial<CommonEntrypoint> { }

export interface EntrypointMatch {
  <R extends AbstractRequest, P extends AbstractResponse<any>>(req: R, res: P): Promise<boolean>
}

export interface EntrypointHandler {
  <
    T, R extends AbstractRequest<any> = AbstractRequest<any>,
    P extends AbstractResponse<any> = AbstractResponse<any>,
  >(req: R, res: P): T | Promise<T>
}

export interface EntrypointAssert {
  <R extends AbstractRequest, P extends AbstractResponse<any>>(req: R, res: P, params: string[]): Promise<void>
}

export interface AbstractRequest<T extends {} = {}> {
  alias: string
  auth?: Auth
  params: Record<string, string | number | undefined | null> | Partial<T>
  body?: Record<string, any> | Partial<T>
  headers: Record<string, string[] | string | undefined>
  query: Record<string, string | number | undefined | null> | Partial<T>
  path: string
  original?: any
  canceled?: boolean
  cancel?: () => void
  host?: string
  base?: string | boolean
  unsecure?: boolean
}

export interface AbstractResponse<T> {
  responseProvider?: any
  value?: T,
  outcome?: EntrypointOutcome
  error?: Error
  resolve: (value: T, outcome?: EntrypointOutcome) => void
  reject: (error: Error) => void
}

export interface GuardService extends InitializedService {
  // Client guard
  token?: string
  authenticated: (req?: Partial<AbstractRequest>) => Promise<string | null>
  // Server guard
  match: EntrypointMatch
  handle: EntrypointHandler
}

export interface GateService extends LazyService {
  /**
   * @throws {Error}
   */
  assert: EntrypointAssert
}

export interface Filter {
  query?: AnySchemaObject
  params?: AnySchemaObject
  body?: AnySchemaObject
  response?: AnySchemaObject
  headers?: AnySchemaObject
}
