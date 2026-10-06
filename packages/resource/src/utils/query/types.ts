import type { Criteria, ListOptions, ListResult, ResourceRecord, Sort } from '../../types.js'

/**
 * In-memory evaluation of `Criteria<any>` — the engine every store without a query language of its
 * own (state, static, client, redis) answers a criteria object through.
 */
export interface RecordQueryHelper {
  /**
   * Whether one record satisfies the criteria.
   *
   * `undefined` as a criteria value is skipped rather than compared — it is what an optional filter
   * looks like when nothing was chosen, and treating it as "must be undefined" makes an unset
   * dropdown filter the list down to nothing.
   *
   * @throws {UnsupportedArgumentError} on an unknown operator.
   */
  matchCriteria: <T extends ResourceRecord>(record: T, criteria?: Criteria<any>) => boolean
  /** Every record the criteria accepts, in insertion order. */
  filterRecords: <T extends ResourceRecord>(records: T[], criteria?: Criteria<any>) => T[]
  /**
   * Sort a copy. A bare field name is ascending; `{ field, order: 'desc' }` reverses it — the same
   * meaning every backend gives it, so a sort written for one store orders the same way against
   * another.
   */
  sortRecords: <T extends ResourceRecord>(records: T[], sort?: Sort<any>[]) => T[]
  /** The first record the criteria accepts, honouring the sort. */
  firstMatch: <T extends ResourceRecord>(
    records: T[], where?: Criteria<any>, opts?: { sort?: Sort<any>[] }
  ) => T | null
  /**
   * Filter, sort and page an in-memory record set into the shape every resource answers with.
   * `size` is opt-in: an in-memory store returns everything when none is asked for.
   */
  applyQuery: <T extends ResourceRecord>(
    records: T[], where?: Criteria<any>, opts?: ListOptions<any>
  ) => ListResult<T>
}
