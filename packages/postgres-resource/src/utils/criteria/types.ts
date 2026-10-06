import type { Criteria, Sort } from '@owlmeans/resource'
import type { SQL } from 'drizzle-orm'

import type { PgRuntimeTable, TableSpec } from '../../types.js'

/** The portable criteria and sort vocabulary, as Drizzle SQL over one compiled table. */
export interface PgCriteriaHelper {
  /**
   * Translate a {@link Criteria} into a WHERE clause. `undefined` means "no constraint at
   * all" — the caller decides whether that is a full scan or a refusal.
   *
   * An unknown key raises rather than being skipped: a typo silently widening a query to
   * the whole table is the failure mode worth being loud about.
   *
   * @throws {UnsupportedArgumentError}
   */
  criteriaToSql: <T>(criteria: Criteria<T> | undefined, spec: TableSpec, table: PgRuntimeTable) => SQL | undefined
  /**
   * Translate a {@link Sort} list into ORDER BY. A bare field name is ascending;
   * `{ field, order: 'desc' }` reverses it — the same meaning every backend gives it.
   *
   * The primary key is always appended as a tiebreak. Postgres has no implicit row order, so
   * paginating on a non-unique sort key silently duplicates and skips rows between pages —
   * a difference from mongo that would otherwise surface as a data bug rather than an error.
   *
   * A dotted path is a column this table does not have: criteria can reach into jsonb, ORDER BY
   * cannot, and refusing is better than ordering by something the caller did not name.
   *
   * @throws {UnsupportedArgumentError}
   */
  sortToSql: <T>(sort: Sort<T>[] | undefined, spec: TableSpec, table: PgRuntimeTable) => SQL[]
}
