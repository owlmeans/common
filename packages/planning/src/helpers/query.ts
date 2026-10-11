import type { Criteria, ListOptions, ResourceRecord, Sort } from '@owlmeans/resource'
import { IntrinsicStatus, WorkcardKind } from '../consts.js'
import type { IntrinsicCounts, RelationshipQuery, RelationshipQueryWire, RelationshipWhere, Specification, SpecificationQuery, SpecificationQueryWire, SummaryQuery, SummaryQueryWire, SummaryView, TransitionQuery, TransitionQueryWire, TransitionWhere, Workcard, WorkcardQuery, WorkcardQueryWire } from '../types.js'
import type { QueryHelper } from './query/types.js'
import type { Scope } from './types.local.js'
import { wireHelper } from './wire.js'

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

export const createQueryHelper = (): QueryHelper => {
  /** `%`, `_` and `\` are wildcards/escapes to `$ilike`; a search text means them literally. */
  const escapeLike = (text: string): string => text.replace(/[\\%_]/g, char => `\\${char}`)

  const criteriaOf = (query?: WorkcardQuery | null, scope?: Scope): Criteria<Workcard> => {
    const where: Record<string, unknown> = {
      entityId: scope?.entityId,
      kind: query?.kind,
      type: query?.type,
      status: query?.status,
      intrinsic: query?.intrinsic,
      code: query?.code,
      parent: query?.parent,
      parents: query?.within != null ? { $contains: query.within } : undefined,
      labels: query?.labels != null ? { $overlaps: query.labels } : undefined,
      id: query?.ids != null ? { $in: query.ids } : undefined,
      category: query?.category,
      updatedAt: query?.updatedSince != null ? { $gte: query.updatedSince } : undefined,
    }
    if (query?.flow != null) {
      where[`flows.${query.flow.id}`] = query.flow.status
    }
    for (const [key, value] of Object.entries(query?.fields ?? {})) {
      if (value !== undefined) {
        where[`fields.${key}`] = value
      }
    }
    if (query?.q != null && query.q !== '') {
      const like = `%${escapeLike(query.q)}%`
      where.$or = [
        { title: { $ilike: like } },
        { description: { $ilike: like } },
        { code: { $startsWith: query.q } },
      ]
    }

    return clean(where) as Criteria<Workcard>
  }

  const listOptionsOf = <T extends ResourceRecord>(query?: ListOptions<T> | null): ListOptions<T> => clean({
    page: query?.page,
    size: query?.size,
    sort: query?.sort,
  })

  const specCriteriaOf = (
    parent: string, query?: SpecificationQuery | null, scope?: Scope
  ): Criteria<Specification> => clean({
    entityId: scope?.entityId,
    kind: WorkcardKind.Specification,
    parent,
    category: query?.category,
  }) as Criteria<Specification>

  const linkWhereOf = (query: RelationshipQuery | null | undefined, scope: Scope): RelationshipWhere => clean({
    entityId: scope.entityId,
    from: query?.from,
    to: query?.to,
    type: query?.type, fromKind: query?.fromKind, toKind: query?.toKind,
  })

  const transitionWhereOf = (query: TransitionQuery | null | undefined, scope: Scope): TransitionWhere => clean({
    entityId: scope.entityId,
    card: query?.card,
    project: query?.project,
    sinceSeq: query?.sinceSeq,
    action: query?.action,
    state: query?.state,
  })

  const emptyCounts = (): IntrinsicCounts => ({
    total: 0, [IntrinsicStatus.Planned]: 0, [IntrinsicStatus.InProgress]: 0, [IntrinsicStatus.Closed]: 0,
  })

  const summaryOf = (cards: Workcard[], parents: string[]): SummaryView => cards.reduce<SummaryView>(
    (view, card) => {
      if (card.parent == null || !parents.includes(card.parent)) {
        return view
      }
      const counts = view[card.parent] ?? emptyCounts()
      counts.total += 1
      counts[card.intrinsic] = (counts[card.intrinsic] ?? 0) + 1
      view[card.parent] = counts
      return view
    }, {}
  )

  return { criteriaOf, listOptionsOf, specCriteriaOf, linkWhereOf, transitionWhereOf, summaryOf }
}

export const queryHelper = createQueryHelper()

/** @deprecated compat:factory-refactor — use `queryHelper.criteriaOf(…)` */
export const criteriaOf = (query?: WorkcardQuery | null, scope?: Scope): Criteria<Workcard> =>
  queryHelper.criteriaOf(query, scope)

/** @deprecated compat:factory-refactor — use `queryHelper.listOptionsOf(…)` */
export const listOptionsOf = <T extends ResourceRecord>(query?: ListOptions<T> | null): ListOptions<T> =>
  queryHelper.listOptionsOf<T>(query)

/** @deprecated compat:factory-refactor — use `queryHelper.specCriteriaOf(…)` */
export const specCriteriaOf = (
  parent: string, query?: SpecificationQuery | null, scope?: Scope
): Criteria<Specification> => queryHelper.specCriteriaOf(parent, query, scope)

/** @deprecated compat:factory-refactor — use `queryHelper.linkWhereOf(…)` */
export const linkWhereOf = (query: RelationshipQuery | null | undefined, scope: Scope): RelationshipWhere =>
  queryHelper.linkWhereOf(query, scope)

/** @deprecated compat:factory-refactor — use `queryHelper.transitionWhereOf(…)` */
export const transitionWhereOf = (query: TransitionQuery | null | undefined, scope: Scope): TransitionWhere =>
  queryHelper.transitionWhereOf(query, scope)

/** @deprecated compat:factory-refactor — use `queryHelper.summaryOf(…)` */
export const summaryOf = (cards: Workcard[], parents: string[]): SummaryView => queryHelper.summaryOf(cards, parents)

/** @deprecated compat:factory-refactor — use `wireHelper.encodeList(…)` */
export const encodeList = (value?: string | readonly string[] | null): string | undefined => wireHelper.encodeList(value)

/** @deprecated compat:factory-refactor — use `wireHelper.decodeList(…)` */
export const decodeList = (value: unknown, key: string = 'list'): string[] | undefined => wireHelper.decodeList(value, key)

/** @deprecated compat:factory-refactor — use `wireHelper.encodeSort(…)` */
export const encodeSort = <T>(sort?: Sort<T>[] | null): string | undefined => wireHelper.encodeSort<T>(sort)

/** @deprecated compat:factory-refactor — use `wireHelper.decodeSort(…)` */
export const decodeSort = <T>(value: unknown): Sort<T>[] | undefined => wireHelper.decodeSort<T>(value)

/** @deprecated compat:factory-refactor — use `wireHelper.encodeWorkcardQuery(…)` */
export const encodeWorkcardQuery = (query?: WorkcardQuery | null): WorkcardQueryWire => wireHelper.encodeWorkcardQuery(query)

/** @deprecated compat:factory-refactor — use `wireHelper.decodeWorkcardQuery(…)` */
export const decodeWorkcardQuery = (wire?: WorkcardQueryWire | WorkcardQuery | null): WorkcardQuery =>
  wireHelper.decodeWorkcardQuery(wire)

/** @deprecated compat:factory-refactor — use `wireHelper.encodeSummaryQuery(…)` */
export const encodeSummaryQuery = (query: SummaryQuery): SummaryQueryWire => wireHelper.encodeSummaryQuery(query)

/** @deprecated compat:factory-refactor — use `wireHelper.decodeSummaryQuery(…)` */
export const decodeSummaryQuery = (wire?: SummaryQueryWire | SummaryQuery | null): SummaryQuery =>
  wireHelper.decodeSummaryQuery(wire)

/** @deprecated compat:factory-refactor — use `wireHelper.encodeTransitionQuery(…)` */
export const encodeTransitionQuery = (query?: TransitionQuery | null): TransitionQueryWire =>
  wireHelper.encodeTransitionQuery(query)

/** @deprecated compat:factory-refactor — use `wireHelper.decodeTransitionQuery(…)` */
export const decodeTransitionQuery = (wire?: TransitionQueryWire | TransitionQuery | null): TransitionQuery =>
  wireHelper.decodeTransitionQuery(wire)

/** @deprecated compat:factory-refactor — use `wireHelper.encodeSpecificationQuery(…)` */
export const encodeSpecificationQuery = (query?: SpecificationQuery | null): SpecificationQueryWire =>
  wireHelper.encodeSpecificationQuery(query)

/** @deprecated compat:factory-refactor — use `wireHelper.decodeSpecificationQuery(…)` */
export const decodeSpecificationQuery = (wire?: SpecificationQueryWire | SpecificationQuery | null): SpecificationQuery =>
  wireHelper.decodeSpecificationQuery(wire)

/** @deprecated compat:factory-refactor — use `wireHelper.encodeRelationshipQuery(…)` */
export const encodeRelationshipQuery = (query?: RelationshipQuery | null): RelationshipQueryWire =>
  wireHelper.encodeRelationshipQuery(query)

/** @deprecated compat:factory-refactor — use `wireHelper.decodeRelationshipQuery(…)` */
export const decodeRelationshipQuery = (wire?: RelationshipQueryWire | RelationshipQuery | null): RelationshipQuery =>
  wireHelper.decodeRelationshipQuery(wire)
