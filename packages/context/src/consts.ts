
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

export const EMPTY_ENTITY = '[UNDEFINED_ENTITY]'
export const EMPTY_PROFILE = '[UNDEFINED_PROFILE]'

// Idioms to compose app
/**
 * It's used to define intermedieate base route
 */
export const ROOT = 'root'
/**
 * It's used to define the home final route (default route in the app)
 */
export const HOME = 'home'
/**
 * It's used to define intermediate area where authentication isn't required
 */
export const GUEST = 'guest'
/**
 * It's used to define intermediate area where authentication is required
 */
export const BASE = 'base'
/**
 * It's used to show user some fallbacke error screen when things gone completely wrong
 */
export const CRASH = 'crash'
