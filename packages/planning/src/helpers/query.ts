import type { Criteria, ListOptions, ResourceRecord, Sort } from '@owlmeans/resource'
import { IntrinsicStatus, WorkcardKind } from '../consts.js'
import { PlanningError } from '../errors.js'
import type {
  IntrinsicCounts, ListWire, PlanningScope, RelationshipQuery, RelationshipQueryWire, RelationshipWhere,
  Specification, SpecificationQuery, SpecificationQueryWire, SummaryQuery, SummaryQueryWire, SummaryView,
  TransitionQuery, TransitionQueryWire, TransitionWhere, Workcard, WorkcardQuery, WorkcardQueryWire,
} from '../types.js'

type Scope = Pick<PlanningScope, 'entityId'>

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

/** `%`, `_` and `\` are wildcards/escapes to `$ilike`; a search text means them literally. */
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, char => `\\${char}`)

/**
 * `WorkcardQuery` → `Criteria<Workcard>` — the ONE translation every store answers, so a query
 * means the same thing in memory, in Mongo and in a client mirror.
 *
 * `entityId` always comes from the scope (a query that forgot it would be a cross-tenant read);
 * `undefined` values are omitted. Paging and sorting are {@link listOptionsOf}'s.
 */
export const criteriaOf = (query?: WorkcardQuery | null, scope?: Scope): Criteria<Workcard> => {
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

/** Paging and sorting out of a query. `size: 0` (no limit) survives. */
export const listOptionsOf = <T extends ResourceRecord>(query?: ListOptions<T> | null): ListOptions<T> => clean({
  page: query?.page,
  size: query?.size,
  sort: query?.sort,
})

/** The criteria over a parent's specifications. */
export const specCriteriaOf = (
  parent: string, query?: SpecificationQuery | null, scope?: Scope
): Criteria<Specification> => clean({
  entityId: scope?.entityId,
  kind: WorkcardKind.Specification,
  parent,
  category: query?.category,
}) as Criteria<Specification>

export const linkWhereOf = (query: RelationshipQuery | null | undefined, scope: Scope): RelationshipWhere => clean({
  entityId: scope.entityId,
  from: query?.from,
  to: query?.to,
  type: query?.type,
})

export const transitionWhereOf = (query: TransitionQuery | null | undefined, scope: Scope): TransitionWhere => clean({
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

/** Counts of DIRECT children (`card.parent`) per parent, by intrinsic state. No key for a parent with none. */
export const summaryOf = (cards: Workcard[], parents: string[]): SummaryView => cards.reduce<SummaryView>(
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

// ─── Wire encoding ───────────────────────────────────────────────────────────────────────────────

/** A list as one query value: comma-joined, or JSON when an element itself holds a comma. */
export const encodeList = (value?: string | readonly string[] | null): string | undefined => {
  if (value == null) {
    return undefined
  }
  if (typeof value === 'string') {
    return encodeList([value])
  }
  if (value.length === 0) {
    return undefined
  }

  return value.some(entry => entry.includes(',') || entry.startsWith('['))
    ? JSON.stringify(value)
    : value.join(',')
}

/** Every entry of a list query value, whatever shape the transport left it in. */
export const decodeList = (value: unknown, key: string = 'list'): string[] | undefined => {
  if (value == null || value === '') {
    return undefined
  }
  if (Array.isArray(value)) {
    const entries = value.filter(entry => entry != null && entry !== '').map(entry => `${entry}`)
    return entries.length > 0 ? entries : undefined
  }
  if (typeof value !== 'string') {
    return [`${value}`]
  }
  if (value.startsWith('[')) {
    const parsed: unknown = (() => {
      try {
        return JSON.parse(value)
      } catch {
        throw new PlanningError(`malformed:query:${key}`)
      }
    })()
    return Array.isArray(parsed) ? parsed.map(entry => `${entry}`) : undefined
  }
  const entries = value.split(',').map(entry => entry.trim()).filter(entry => entry !== '')

  return entries.length > 0 ? entries : undefined
}

/** A list decoded to a bare value when it holds one — the same criteria either way. */
const decodeOneOrMany = <T extends string>(value: unknown, key: string): T | T[] | undefined => {
  const entries = decodeList(value, key) as T[] | undefined
  return entries == null ? undefined : entries.length === 1 ? entries[0] : entries
}

const encodeJson = (value: unknown): string | undefined => value == null ? undefined : JSON.stringify(value)

const decodeJson = <T>(value: unknown, key: string): T | undefined => {
  if (value == null || value === '') {
    return undefined
  }
  if (typeof value !== 'string') {
    return value as T
  }
  try {
    return JSON.parse(value) as T
  } catch {
    throw new PlanningError(`malformed:query:${key}`)
  }
}

const decodeNumber = (value: unknown, key: string): number | undefined => {
  if (value == null || value === '') {
    return undefined
  }
  const number = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(number)) {
    throw new PlanningError(`malformed:query:${key}`)
  }

  return number
}

const decodeBoolean = (value: unknown): boolean | undefined =>
  value == null || value === '' ? undefined : value === true || value === 'true' || value === '1'

const decodeText = (value: unknown): string | undefined =>
  value == null || value === '' ? undefined : `${Array.isArray(value) ? value[0] : value}`

/** `[{ field: 'order' }, { field: 'updatedAt', order: 'desc' }]` ⇄ `order,-updatedAt`. */
export const encodeSort = <T>(sort?: Sort<T>[] | null): string | undefined =>
  sort == null || sort.length === 0 ? undefined : sort.map(entry => typeof entry === 'string'
    ? entry
    : `${entry.order === 'desc' ? '-' : ''}${entry.field}`).join(',')

export const decodeSort = <T>(value: unknown): Sort<T>[] | undefined => {
  if (value == null || value === '') {
    return undefined
  }
  const entries: unknown[] = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [value]
  const sort = entries.flatMap((entry): Sort<T>[] => {
    if (typeof entry !== 'string') {
      return entry != null && typeof entry === 'object' && 'field' in entry ? [entry as Sort<T>] : []
    }
    const field = entry.trim()
    if (field === '' || field === '-') {
      return []
    }
    return field.startsWith('-')
      ? [{ field: field.slice(1) as Sort<T> & string, order: 'desc' } as Sort<T>]
      : [field as Sort<T>]
  })

  return sort.length > 0 ? sort : undefined
}

const encodeListOptions = (query?: ListOptions<any> | null): ListWire => clean({
  page: query?.page,
  size: query?.size,
  sort: encodeSort(query?.sort),
})

const decodeListOptions = <T>(wire: Record<string, unknown>): ListOptions<T> => clean({
  page: decodeNumber(wire.page, 'page'),
  size: decodeNumber(wire.size, 'size'),
  sort: decodeSort<T>(wire.sort),
})

const asRecord = (wire: unknown): Record<string, unknown> =>
  wire != null && typeof wire === 'object' ? wire as Record<string, unknown> : {}

export const encodeWorkcardQuery = (query?: WorkcardQuery | null): WorkcardQueryWire => clean({
  ...encodeListOptions(query),
  kind: encodeList(query?.kind),
  type: encodeList(query?.type),
  parent: query?.parent,
  within: query?.within,
  status: encodeList(query?.status),
  intrinsic: encodeList(query?.intrinsic),
  flow: encodeJson(query?.flow),
  labels: encodeList(query?.labels),
  code: encodeList(query?.code),
  ids: encodeList(query?.ids),
  fields: query?.fields != null && Object.keys(query.fields).length > 0 ? encodeJson(query.fields) : undefined,
  q: query?.q,
  category: encodeList(query?.category),
  updatedSince: query?.updatedSince,
})

/** @throws {PlanningError} `malformed:query:<key>` for a value that does not decode */
export const decodeWorkcardQuery = (wire?: WorkcardQueryWire | WorkcardQuery | null): WorkcardQuery => {
  const value = asRecord(wire)
  return clean({
    ...decodeListOptions<Workcard>(value),
    kind: decodeOneOrMany<WorkcardKind>(value.kind, 'kind'),
    type: decodeOneOrMany(value.type, 'type'),
    parent: decodeText(value.parent),
    within: decodeText(value.within),
    status: decodeOneOrMany(value.status, 'status'),
    intrinsic: decodeOneOrMany<IntrinsicStatus>(value.intrinsic, 'intrinsic'),
    flow: decodeJson<WorkcardQuery['flow']>(value.flow, 'flow'),
    labels: decodeList(value.labels, 'labels'),
    code: decodeOneOrMany(value.code, 'code'),
    ids: decodeList(value.ids, 'ids'),
    fields: decodeJson<Record<string, unknown>>(value.fields, 'fields'),
    q: decodeText(value.q),
    category: decodeOneOrMany(value.category, 'category'),
    updatedSince: decodeText(value.updatedSince),
  })
}

export const encodeSummaryQuery = (query: SummaryQuery): SummaryQueryWire => clean({
  parents: encodeList(query.parents) ?? '',
  kind: query.kind,
  type: encodeList(query.type),
})

export const decodeSummaryQuery = (wire?: SummaryQueryWire | SummaryQuery | null): SummaryQuery => {
  const value = asRecord(wire)
  return clean({
    parents: decodeList(value.parents, 'parents') ?? [],
    kind: decodeText(value.kind) as WorkcardKind | undefined,
    type: decodeOneOrMany(value.type, 'type'),
  })
}

export const encodeTransitionQuery = (query?: TransitionQuery | null): TransitionQueryWire => clean({
  ...encodeListOptions(query),
  card: query?.card,
  project: query?.project,
  sinceSeq: query?.sinceSeq,
  action: encodeList(query?.action),
  state: query?.state,
})

export const decodeTransitionQuery = (wire?: TransitionQueryWire | TransitionQuery | null): TransitionQuery => {
  const value = asRecord(wire)
  return clean({
    ...decodeListOptions(value),
    card: decodeText(value.card),
    project: decodeText(value.project),
    sinceSeq: decodeNumber(value.sinceSeq, 'sinceSeq'),
    action: decodeOneOrMany(value.action, 'action'),
    state: decodeText(value.state),
  }) as TransitionQuery
}

export const encodeSpecificationQuery = (query?: SpecificationQuery | null): SpecificationQueryWire => clean({
  ...encodeListOptions(query),
  category: encodeList(query?.category),
  all: query?.all,
})

export const decodeSpecificationQuery = (wire?: SpecificationQueryWire | SpecificationQuery | null): SpecificationQuery => {
  const value = asRecord(wire)
  return clean({
    ...decodeListOptions<Specification>(value),
    category: decodeOneOrMany(value.category, 'category'),
    all: decodeBoolean(value.all),
  })
}

export const encodeRelationshipQuery = (query?: RelationshipQuery | null): RelationshipQueryWire => clean({
  ...encodeListOptions(query),
  from: encodeList(query?.from),
  to: encodeList(query?.to),
  type: encodeList(query?.type),
})

export const decodeRelationshipQuery = (wire?: RelationshipQueryWire | RelationshipQuery | null): RelationshipQuery => {
  const value = asRecord(wire)
  return clean({
    ...decodeListOptions(value),
    from: decodeOneOrMany(value.from, 'from'),
    to: decodeOneOrMany(value.to, 'to'),
    type: decodeOneOrMany(value.type, 'type'),
  }) as RelationshipQuery
}
