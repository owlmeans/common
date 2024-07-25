import type { ResourceRecord } from '@owlmeans/resource'
import { MisshapedRecord } from '@owlmeans/resource'
import type { StateModel, StateResource } from '../types.js'

export const createStateModel = <T extends ResourceRecord>(
  record: T, resource: StateResource<T>
): StateModel<T> => {
  const model: StateModel<T> = {
    record: { ...record },

    commit: force => {
      if (force !== true) {
        if (!Object.entries(record).reduce(
          (changed, [key, value]) => changed || model.record[key as keyof T] !== value, false
        )) {
          return
        }
      }
      if (record.id == null) {
        throw new MisshapedRecord('id')
      }
      void resource.load(record.id).then(exists => {
        exists != null && resource.update(model.record)
      })
    },

    clear: () => {
      void resource.delete(record)
    }
  }

  return model
}
