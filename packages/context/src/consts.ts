
export enum Layer {
  System = 'system',
  Global = 'global',
  Service = 'service',
  Entity = 'entity',
  User = 'user'
}

export enum AppType {
  Backend = 'backend',
  Frontend = 'frontend',
}

export enum MiddlewareType {
  Config = 'config',
  Context = 'context'
}

export enum ContextStage {
  Configuration = 'configuration',
  Loading = 'loading',
  Ready = 'ready'
}

export enum MiddlewareStage {
  Configuration = 'configuration',
  Loading = 'loading',
  Ready = 'ready',
  Switching = 'switching'
}

export const CONFIG_RECORD = 'records'
