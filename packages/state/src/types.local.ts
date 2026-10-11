import type { Criteria, FirstOptions, ResourceRecord } from '@owlmeans/resource'
import type { StateEvent, StateModel } from './types.js'

export interface QueryWatch<T extends ResourceRecord> {
  where?: Criteria<T>
  opts?: FirstOptions<T>
  listener: (models: StateModel<T>[]) => void
  last: StateModel<T>[]
}

export interface Subscription<T extends ResourceRecord> {
  handler: (value: StateEvent<T>) => void | Promise<void>
  channel: string
  once: boolean
  timer?: ReturnType<typeof setTimeout>
}
