import type { ResourceRecord } from '@owlmeans/resource'
import { MisshapedRecord } from '@owlmeans/resource'
import type { StateModel, StateResource } from '../types.js'

export const createStateModel = <T extends ResourceRecord>(
  record: T, resource: StateResource<T>
): StateModel<T> => {
  let before: T = record
  const model: StateModel<T> = {
    record: { ...record },

    commit: force => {
      if (force !== true) {
        if (!Object.entries(before).reduce(
          (changed, [key, value]) => changed || model.record[key as keyof T] !== value, false
        )) {
          return
        }
      }
      if (record.id == null) {
        throw new MisshapedRecord('id')
      }
      before = model.record
      void resource.load(record.id).then(exists => {
        exists != null && resource.update(model.record)
      })
    },

    update: data => {
      Object.assign(model.record, data)
      model.commit()
    },

    clear: () => {
      void resource.delete(record)
    }
  }

  return model
}
