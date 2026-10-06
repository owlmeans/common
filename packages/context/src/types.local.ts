import type { BasicEntrypoint, Service, InitMethod } from './types.js'

export type Entrypoint = BasicEntrypoint

export interface CreateService<S extends Service> {
  (alias: string, service: Partial<S>, init?: InitMethod<S>): S
}
