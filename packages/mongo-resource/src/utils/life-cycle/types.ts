import type { BasicContext } from '@owlmeans/context'
import type { DbConfig, ResourceRecord } from '@owlmeans/resource'
import type { Collection } from 'mongodb'

import type { MongoResource } from '../../types.js'

/** A resource collection's initialization over one database. */
export interface MongoLifeCycleUtils {
  /**
   * Bring a resource's collection to the shape its schema declares.
   *
   * Order is deliberate, and matches the Postgres counterpart:
   *
   *  1. probe for the collection
   *  2. absent → *baseline* every registered migration; present → run the `pre` ones
   *     (including the system `$ref:` migrations that convert declared references)
   *  3. create the collection, or update its validator and indexes
   *  4. present → run the `post` migrations
   *  5. reconcile declared references — the second half of their double check: the ledger
   *     said whether the `$ref:` migration ran, this probes the collection itself and
   *     converts whatever strings still slipped through
   *
   * Step 2 is what stops the two mechanisms colliding. A `pre` migration runs before the
   * validator is tightened, so it can reshape documents the new validator would reject. On a
   * collection this call just created there is nothing to reshape — replaying a historical
   * migration against a collection born in its final shape would at best scan for nothing —
   * so the migrations are recorded as satisfied instead of run.
   *
   * `context` is optional so the existing three-argument call keeps working; without it a
   * migration's `use`/`ref` can only address the owning resource.
   */
  initializeCollection: (
    config: DbConfig, resource: MongoResource<ResourceRecord>, context?: BasicContext<any>
  ) => Promise<Collection>
  /** Create the collection with its validator and its declared indexes. */
  createCollection: (name: string, resource: MongoResource<ResourceRecord>) => Promise<Collection>
  /** Replace the validator of an existing collection and bring its indexes up to date. */
  updateCollection: (name: string, resource: MongoResource<ResourceRecord>) => Promise<Collection>
}
