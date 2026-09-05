import type { AppType, ContextStage, MiddlewareStage, MiddlewareType, CONFIG_RECORD } from './consts.js'

export interface BasicConfig {
  ready: boolean
  service: string
  // Is used as username of the service (e.g. for looking up for autehntication keys)
  alias?: string
  type: AppType
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
  MaybeArray<ConfigRecordItem | boolean | string | number | null | undefined>> {
  recordType?: string
}

export interface Contextual {
  ctx?: BasicContext<any>
  alias: string
  registerContext: <T extends Contextual, C extends BasicConfig>(context: BasicContext<C>) => T
  assertCtx: <C extends BasicConfig, T extends BasicContext<C>>(location?: string) => T
}

export interface Service extends Contextual {
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

export interface BasicEntrypoint extends Contextual {
  _entrypoint: true
}

export interface BasicResource extends Contextual {
  init?: () => Promise<void>
}

export interface Middleware {
  type: MiddlewareType
  stage: MiddlewareStage
  apply: <C extends BasicConfig, T extends BasicContext<C>>(context: T, args?: Record<string, string | undefined>) => Promise<void>
}

/**
 * The DI container. One context is built per process by one factory: a layer specific
 * factory composes the layer below it and then `append*` mixins register what the
 * application needs. There is no child context and nothing is stored for re-creation —
 * a service, a resource and an entrypoint each bind to exactly one context.
 */
export interface BasicContext<C extends BasicConfig> {
  cfg: C
  stage: ContextStage
  waitForConfigured: () => Promise<boolean>
  waitForInitialized: () => Promise<boolean>
  configure: <T extends BasicContext<C>>() => T
  init: <T extends BasicContext<C>>() => Promise<T>
  registerService: <T extends BasicContext<C>>(service: Service) => T
  registerEntrypoint: <T extends BasicContext<C>>(entrypoint: BasicEntrypoint) => T
  registerEntrypoints: <T extends BasicContext<C>>(entrypoints: BasicEntrypoint[]) => T
  registerResource: <T extends BasicContext<C>>(resource: BasicResource) => T
  registerMiddleware: <T extends BasicContext<C>>(middleware: Middleware) => T

  get config(): Promise<C>
  service: <T extends Service>(alias: string) => T
  entrypoint: <T extends BasicEntrypoint>(alias: string) => T
  resource: <T extends BasicResource>(alias: string) => T
  hasResource: (alias: string) => boolean
  hasService: (alias: string) => boolean
  hasEntrypoint: (alias: string) => boolean

  entrypoints: <T extends BasicEntrypoint>() => T[]
}
