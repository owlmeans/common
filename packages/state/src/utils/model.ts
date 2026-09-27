import type { ResourceRecord } from '@owlmeans/resource'
import type { StateModel } from '../types.js'

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

/**
 * Wrap one record — or its absence — as something a screen can bind to.
 *
 * The working copy is replaced rather than mutated on every write, so the record a caller is
 * holding never changes underneath it and two models of the same record stay comparable by
 * reference.
 */
export const createStateModel = <T extends ResourceRecord>(
  binding: StateModelBinding<T>
): StateModel<T> => {
  /** What an empty model shows: the configured default, or nothing at all. */
  const blank = (): T => binding.default?.() ?? {} as T

  let working: T = binding.record ?? blank()
  let stored = binding.record != null

  const model: StateModel<T> = {
    get id() { return binding.id },

    get empty() { return !stored },

    get record() { return working },

    update: async patch => {
      working = { ...working, ...patch } as T

      return model.commit()
    },

    commit: async () => {
      working = await binding.write(working)
      stored = true

      return working
    },

    clear: async () => {
      await binding.drop()
      stored = false
      working = blank()
    }
  }

  return model
}
