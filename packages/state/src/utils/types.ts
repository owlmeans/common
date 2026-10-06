import type { ResourceRecord } from '@owlmeans/resource'

/**
 * What a model needs from the resource that made it: which record it stands for, and the two
 * writes it can perform. The key stays on the resource side, so a model bound to the one record
 * of a `single` resource works the same as one bound to an id.
 */
export interface StateModelBinding<T extends ResourceRecord> {
  id: string | undefined
  /** The stored record, or `undefined` when the store holds none — an EMPTY model. */
  record: T | undefined
  default?: () => T
  write: (record: T) => Promise<T>
  drop: () => Promise<void>
}
