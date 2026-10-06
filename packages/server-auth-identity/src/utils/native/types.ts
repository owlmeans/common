import type { MongoResource } from '@owlmeans/mongo-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import type { Document } from 'mongodb'

/** What the identity store needs below the resource contract: native filters and native errors. */
export interface NativeUtils {
  /**
   * The collection filter addressing one record by id, exactly as the resource itself addresses it —
   * `id` onto `_id`, a 24-hex string as an `ObjectId`, anything else matching nothing.
   *
   * Field-level updates go through the native collection (the resource contract replaces whole
   * records), so they need the id the way the collection stores it.
   */
  idFilter: <T extends ResourceRecord>(resource: MongoResource<T>, id: string) => Document
  /** A unique index refused the write. */
  isDuplicateKey: (error: unknown) => boolean
}
