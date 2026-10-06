import type { ResourceRecord } from '@owlmeans/resource'
import type { StateModel } from '../types.js'
import type { StateModelBinding } from './types.js'

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
