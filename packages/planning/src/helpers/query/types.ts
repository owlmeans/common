import type { Criteria, ListOptions, ResourceRecord } from '@owlmeans/resource'
import type {
  RelationshipQuery, RelationshipWhere, Specification, SpecificationQuery, SummaryView, TransitionQuery,
  TransitionWhere, Workcard, WorkcardQuery,
} from '../../types.js'
import type { Scope } from '../types.local.js'

/** The ONE translation of a planning query into the store's criteria, and the views read from it. */
export interface QueryHelper {
  /**
   * `WorkcardQuery` → `Criteria<Workcard>` — the ONE translation every store answers, so a query
   * means the same thing in memory, in Mongo and in a client mirror.
   *
   * `entityId` always comes from the scope (a query that forgot it would be a cross-tenant read);
   * `undefined` values are omitted. Paging and sorting are {@link QueryHelper.listOptionsOf}'s.
   */
  criteriaOf: (query?: WorkcardQuery | null, scope?: Scope) => Criteria<Workcard>
  /** Paging and sorting out of a query. `size: 0` (no limit) survives. */
  listOptionsOf: <T extends ResourceRecord>(query?: ListOptions<T> | null) => ListOptions<T>
  /** The criteria over a parent's specifications. */
  specCriteriaOf: (parent: string, query?: SpecificationQuery | null, scope?: Scope) => Criteria<Specification>
  linkWhereOf: (query: RelationshipQuery | null | undefined, scope: Scope) => RelationshipWhere
  transitionWhereOf: (query: TransitionQuery | null | undefined, scope: Scope) => TransitionWhere
  /** Counts of DIRECT children (`card.parent`) per parent, by intrinsic state. No key for a parent with none. */
  summaryOf: (cards: Workcard[], parents: string[]) => SummaryView
}
