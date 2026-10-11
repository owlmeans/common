import type { BasicContext } from '@owlmeans/context'

import type { DdlPlan, DdlStatement, LiveTable, TableSpec } from '../../types.js'

/** Structure reconciliation: the DDL that converges a live table onto its compiled spec. */
export interface PgDiffHelper {
  /**
   * The form an index or constraint definition is compared in, so the statement this package emits
   * and the text Postgres reports for the object it created compare equal.
   *
   * Postgres deparses what it stores: it leaves an identifier unquoted when it can, casts every
   * literal (`''::text`), casts a `varchar` column inside an expression, wraps a partial predicate and
   * each of its operator expressions in parentheses, and rewrites `x IN (…)` as `x = ANY (ARRAY[…])`.
   * Comparing the raw texts made every boot drop and recreate every declared index and every enum
   * `CHECK`. So both sides lose case, quotes, casts, whitespace and parentheses, and `= ANY (ARRAY[…])`
   * reads as `IN (…)`. What that cannot tell apart — two definitions differing only in how their
   * operators group — is a change to make under a new name.
   */
  canonicalDefinition: (definition: string) => string
  /**
   * Foreign keys are planned separately from the rest of the table, and applied only once
   * every resource has initialized: a key points at a table another resource owns, and that
   * resource's own `init()` may not have run yet.
   *
   * @throws {PostgresPlaceholderError} when a target can't be resolved.
   */
  planForeignKeys: (spec: TableSpec, context?: BasicContext<any>) => DdlStatement[]
  /**
   * Compare the compiled specification against the live table and produce the ordered DDL
   * that converges one onto the other.
   *
   * Statement order is load bearing:
   *  - `DROP COLUMN` is last, because a `USING` cast or a backfill may legitimately read a
   *    column that is about to disappear.
   *  - A primary key constraint is never dropped: it cascades into every referencing key and
   *    can't be undone inside the same transaction once dependents exist.
   *
   * Foreign keys are not part of the plan at all — see {@link PgDiffHelper.planForeignKeys}.
   */
  planSync: (spec: TableSpec, live: LiveTable, additive?: boolean) => DdlPlan
}
