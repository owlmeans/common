import type { ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '../types.js'
import type { Collection, Document } from 'mongodb'
import { logger } from '@owlmeans/log'
import { REPORTED_FIELDS } from './consts.local.js'
import type { MongoIndexUtils } from './indexes/types.js'

const log = logger('mongo-resource')

const options = (spec: Document): [string, unknown][] => Object.entries(spec)
  .filter(([field]) => field !== 'key' && !REPORTED_FIELDS.has(field))
  .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)

export const createMongoIndexUtils = (): MongoIndexUtils => {
  const indexChanged = (existing: Document, proposed: Document): boolean => {
    // We do not recreate text indexes.
    if ('weights' in existing) return false
    if (JSON.stringify(existing.key) !== JSON.stringify(proposed.key)) return true

    return JSON.stringify(options(existing)) !== JSON.stringify(options(proposed))
  }

  const updateIndexes = async (collection: Collection, resource: MongoResource<ResourceRecord>): Promise<void> => {
    if (resource.indexes == null) {
      return
    }
    const present = await collection.indexes()
    await Promise.all(resource.indexes.map(
      async index => {
        const create = async () => await collection.createIndex(index.index, {
          name: index.name, ...((index.options != null) ? index.options : {})
        })
        const existing = present.find(_index => _index.name === index.name)
        if (existing == null) {
          log.debug('Create index', { resource: resource.alias, index: index.name })
          await create()
          return
        }
        if (!indexChanged(existing, { key: index.index, ...index.options })) {
          return
        }
        log.debug('Recreate index', { resource: resource.alias, index: index.name })
        try {
          await collection.dropIndex(index.name)
        } catch (e) {
          // IndexNotFound: another process booting alongside this one dropped it first — it is
          // recreating the same declaration, so there is nothing here to fail over.
          if ((e as { code?: number }).code !== 27) throw e
        }
        await create()
      }
    ))
  }

  return { indexChanged, updateIndexes }
}

export const mongoIndexUtils = createMongoIndexUtils()
