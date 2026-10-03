import { criteriaToFilter, MONGO_DUPLICATE_KEY } from '@owlmeans/mongo-resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import type { Document } from 'mongodb'

/**
 * The collection filter addressing one record by id, exactly as the resource itself addresses it —
 * `id` onto `_id`, a 24-hex string as an `ObjectId`, anything else matching nothing.
 *
 * Field-level updates go through the native collection (the resource contract replaces whole
 * records), so they need the id the way the collection stores it.
 */
export const idFilter = <T extends ResourceRecord>(resource: MongoResource<T>, id: string): Document =>
  criteriaToFilter({ id }, new Map(resource.references().map(ref => [ref.field, ref])))

/** A unique index refused the write. */
export const isDuplicateKey = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === MONGO_DUPLICATE_KEY
