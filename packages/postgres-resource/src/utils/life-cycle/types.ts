import type { BasicContext } from '@owlmeans/context'
import type { DbConfig, ResourceRecord } from '@owlmeans/resource'

import type { PostgresResource, TableSpec } from '../../types.js'
import type { TableInit } from '../types.js'

/** A resource table's initialization over one database handle. */
export interface PgLifeCycleHelper {
  /**
   * Bring a resource's table to the shape its schema declares, then hand back everything the
   * resource needs to query it. The Postgres counterpart of mongo's `initializeCollection`.
   *
   * The whole sequence runs inside a session level advisory lock keyed on the qualified table
   * name, so replicas booting simultaneously converge one at a time instead of racing each
   * other's DDL — a race mongo's converge-on-boot leaves open.
   *
   * Order is deliberate:
   *
   *  1. probe for the table
   *  2. absent → *baseline* every registered migration; present → run the `pre` ones
   *  3. reconcile structure against the schema
   *  4. present → run the `post` migrations
   *  5. queue foreign keys for after every resource has initialized
   *
   * Step 2 is what stops the two mechanisms colliding. On a fresh deployment the table is
   * created directly to its final shape, so migrations that would have produced that shape
   * are recorded as satisfied rather than replayed against a table that already matches.
   */
  initializeTable: (
    config: DbConfig, resource: PostgresResource<ResourceRecord>,
    context: BasicContext<any>, defer: (task: () => Promise<void>) => void
  ) => Promise<TableInit>
  /**
   * Add the foreign keys the schema declares, skipping any Postgres already holds.
   *
   * Constraints are compared by name only. A key whose *definition* drifted has to be dropped
   * by hand or in a migration: `ALTER TABLE ... DROP CONSTRAINT` on a foreign key is not a
   * change worth making on a boot nobody is watching.
   */
  applyForeignKeys: (spec: TableSpec, context: BasicContext<any>) => Promise<void>
}
