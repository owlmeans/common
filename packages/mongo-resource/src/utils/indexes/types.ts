import type { ResourceRecord } from '@owlmeans/resource'
import type { Collection, Document } from 'mongodb'

import type { MongoResource } from '../../types.js'

/** A collection's indexes against the ones its resource declares. */
export interface MongoIndexUtils {
  /**
   * Whether an index the database already holds differs from the one declared.
   *
   * Mongo returns an index's options in ITS order, not the declaration's, so comparing the two
   * documents as JSON reported every index as changed — and every boot then dropped and recreated
   * every index. That is invisible until two processes boot at once, when the second one's drop
   * fails with `IndexNotFound` and takes the service down with it. Only the KEY is order-sensitive
   * (a compound index is its key order); options are a set.
   */
  indexChanged: (existing: Document, proposed: Document) => boolean
  /** Create the declared indexes the collection lacks and recreate the ones that changed. */
  updateIndexes: (collection: Collection, resource: MongoResource<ResourceRecord>) => Promise<void>
}
