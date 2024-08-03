import type { AppType, ContextStage, Layer, MiddlewareStage, MiddlewareType, CONFIG_RECORD } from './consts.js'

export interface BasicConfig {
  ready: boolean
  service: string
  layer: Layer
  type: AppType
  layerId?: string
  services?: Record<string, Object>
  [CONFIG_RECORD]?: ConfigRecord[]
  debug?: {
    all?: boolean
    [section: string]: boolean | undefined
  }
}

export interface ConfigRecord extends ConfigRecordItem {
  id: string
}

type MaybeArray<T> = T | T[]

interface ConfigRecordItem extends Record<
  string,
  MaybeArray<ConfigRecordItem | boolean | string | number | undefined>> {
}

export interface Contextual {
  ctx?: BasicContext<any>
  alias: string
  reinitializeContext?: <T extends Contextual>(context: BasicContext<any>) => T // This method is a fix to replace context inside closed scope
  registerContext: <T extends Contextual, C extends BasicConfig>(context: BasicContext<C>) => T
}

export interface Service extends Contextual {
  layers?: Layer[]
  initialized: boolean
  init?: () => Promise<void>
  lazyInit?: () => Promise<void>
  ready?: () => Promise<boolean>
}

export interface InitializedService extends Service {
  init: () => Promise<void>
  ready: () => Promise<boolean>
}

export interface LazyService extends Service {
  lazyInit: () => Promise<void>
  ready: () => Promise<boolean>
}

export interface BasicModule extends Contextual {
  _module: true
}

export interface BasicResource extends Contextual {
  layer?: Layer
  init?: () => Promise<void> // After context switch the resource should be able to reinitialize
}

export interface Middleware {
  type: MiddlewareType
  stage: MiddlewareStage
  apply: <C extends BasicConfig, T extends BasicContext<C>>(context: T, args?: Record<string, string | undefined>) => Promise<void>
}

export interface BasicContext<C extends BasicConfig> {
  cfg: C
  stage: ContextStage
  waitForConfigured: () => Promise<boolean>
  waitForInitialized: () => Promise<boolean>
  configure: <T extends BasicContext<C>>() => T
  init: <T extends BasicContext<C>>() => Promise<T>
  updateContext: <T extends BasicContext<C>>(id?: string, to?: Layer) => Promise<T>
  registerService: <T extends BasicContext<C>>(service: Service) => T
  registerModule: <T extends BasicContext<C>>(module: BasicModule) => T
  registerModules: <T extends BasicContext<C>>(module: BasicModule[]) => T
  registerResource: <T extends BasicContext<C>>(resource: BasicResource) => T
  registerMiddleware: <T extends BasicContext<C>>(middleware: Middleware) => T

  get config(): Promise<C>
  service: <T extends Service>(alias: string) => T
  module: <T extends BasicModule>(alias: string) => T
  resource: <T extends BasicResource>(alias: string) => T
  hasResource: (alias: string) => boolean
  hasService: (alias: string) => boolean

  modules: <T extends BasicModule>() => T[]

  makeContext?: <T extends BasicContext<C>>(cfg: C) => T
}
