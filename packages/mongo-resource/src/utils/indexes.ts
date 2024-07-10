import type { ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '../types.js'
import type { Collection } from 'mongodb'

export const updateIndexes = async (collection: Collection, resource: MongoResource<ResourceRecord>) => {
  if (resource.indexes != null) {
    await Promise.all(resource.indexes.map(
      async index => {
        const _index = (await collection.indexes()).find(_index => _index.name === index.name)
        if (_index != null) {
          const existing = { ..._index }
          if ('name' in existing) {
            delete existing.name
          }
          if ('v' in existing) {
            delete existing.v
          }
          const propsed = { key: index.index, ...index.options }
          // We do not recreate text indexes
          if (JSON.stringify(existing) !== JSON.stringify(propsed) && !('weights' in existing)) {
            console.info(JSON.stringify(existing))
            console.info(JSON.stringify(propsed))
            console.debug(`Recreate index ${resource.alias} : ${index.name}`)
            await collection.dropIndex(index.name)
            await collection.createIndex(index.index, {
              name: index.name, ...((index.options != null) ? index.options : {})
            })
          }
        } else {
          console.debug(`Create index ${resource.alias} : ${index.name}`)
          await collection.createIndex(index.index, {
            name: index.name, ...((index.options != null) ? index.options : {})
          })
        }
      }
    ))
  }
}
