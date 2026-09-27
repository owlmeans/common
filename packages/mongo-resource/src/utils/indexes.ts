import type { ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '../types.js'
import type { Collection, Document } from 'mongodb'

/** What the SERVER reports about an index rather than what a declaration asks for — never a
 *  reason to recreate one. `collation` is here because a collection's default collation is
 *  reported on every index in it, including the ones declared without any. */
const REPORTED_FIELDS = new Set([
  'v', 'ns', 'name', 'collation', 'textIndexVersion', '2dsphereIndexVersion', 'background'
])

const options = (spec: Document): [string, unknown][] => Object.entries(spec)
  .filter(([field]) => field !== 'key' && !REPORTED_FIELDS.has(field))
  .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)

/**
 * Whether an index the database already holds differs from the one declared.
 *
 * Mongo returns an index's options in ITS order, not the declaration's, so comparing the two
 * documents as JSON reported every index as changed — and every boot then dropped and recreated
 * every index. That is invisible until two processes boot at once, when the second one's drop
 * fails with `IndexNotFound` and takes the service down with it. Only the KEY is order-sensitive
 * (a compound index is its key order); options are a set.
 */
export const indexChanged = (existing: Document, proposed: Document): boolean => {
  // We do not recreate text indexes.
  if ('weights' in existing) return false
  if (JSON.stringify(existing.key) !== JSON.stringify(proposed.key)) return true

  return JSON.stringify(options(existing)) !== JSON.stringify(options(proposed))
}

export const updateIndexes = async (collection: Collection, resource: MongoResource<ResourceRecord>) => {
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
        console.debug(`Create index ${resource.alias} : ${index.name}`)
        await create()
        return
      }
      if (!indexChanged(existing, { key: index.index, ...index.options })) {
        return
      }
      console.debug(`Recreate index ${resource.alias} : ${index.name}`)
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
