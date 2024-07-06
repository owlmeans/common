import type { AppType, ContextStage, Layer, MiddlewareStage, MiddlewareType, CONFIG_RECORD } from './consts.js'

export interface Config {
  ready: boolean
  service: string
  layer: Layer
  type: AppType
  layerId?: string
  services?: Record<string, Object>
  [CONFIG_RECORD]?: ConfigRecord[]
}

export interface ConfigRecord extends ConfigRecordItem {
  id: string
}

interface ConfigRecordItem extends Record<string, ConfigRecordItem | string | number | undefined> {
}

export interface Contextual {
  ctx?: Context
  alias: string
  reinitializeContext?: <T extends Contextual>() => T // This method is a fix to replace context inside closed scope
  registerContext: <T extends Contextual>(context: Context) => T
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

export interface Module extends Contextual {
  _module: true
}

export interface Resource extends Contextual {
  layer?: Layer
  init?: () => Promise<void> // After context switch the resource should be able to reinitialize
}

export interface Middleware {
  type: MiddlewareType
  stage: MiddlewareStage
  apply: (context: Context, args?: Record<string, string | undefined>) => Promise<void>
}

export interface Context<C extends Config = Config> {
  cfg: C
  stage: ContextStage
  waitForConfigured: () => Promise<boolean>
  waitForInitialized: () => Promise<boolean>
  configure: <T extends Context<C>>() => T
  init: <T extends Context<C>>() => T
  updateContext: <T extends Context<C>>(id?: string) => T
  registerService: <T extends Context<C>>(service: Service) => T
  registerModule: <T extends Context<C>>(module: Module) => T
  registerModules: <T extends Context<C>>(module: Module[]) => T
  registerResource: <T extends Context<C>>(resource: Resource) => T
  registerMiddleware: <T extends Context<C>>(middleware: Middleware) => T

  get config(): Promise<C>
  service: <T extends Service>(alias: string) => T
  module: <T extends Module>(alias: string) => T
  resource: <T extends Resource>(alias: string) => T

  modules: <T extends Module>() => T[]
}
