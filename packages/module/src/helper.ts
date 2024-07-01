import { Filter, ModuleOptions } from './types.js'

export const filter = (filter: Filter, opts?: ModuleOptions): ModuleOptions => ({ filter, ...opts })

export const guard = (guard: string, opts?: ModuleOptions): ModuleOptions =>
  ({ ...opts, guards: [guard, ...(opts?.guards ?? [])] })
