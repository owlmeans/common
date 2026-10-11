import type { ListOptions, Sort } from '@owlmeans/resource'
import { IntrinsicStatus, WorkcardKind } from '../consts.js'
import { PlanningError } from '../errors.js'
import type { ListWire, RelationshipQuery, RelationshipQueryWire, Specification, SpecificationQuery, SpecificationQueryWire, SummaryQuery, SummaryQueryWire, TransitionQuery, TransitionQueryWire, Workcard, WorkcardQuery, WorkcardQueryWire } from '../types.js'
import type { WireHelper } from './wire/types.js'

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

export const createWireHelper = (): WireHelper => {
  const encodeList = (value?: string | readonly string[] | null): string | undefined => {
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

  const decodeList = (value: unknown, key: string = 'list'): string[] | undefined => {
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

  const encodeSort = <T>(sort?: Sort<T>[] | null): string | undefined =>
    sort == null || sort.length === 0 ? undefined : sort.map(entry => typeof entry === 'string'
      ? entry
      : `${entry.order === 'desc' ? '-' : ''}${entry.field}`).join(',')

  const decodeSort = <T>(value: unknown): Sort<T>[] | undefined => {
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

  const encodeWorkcardQuery = (query?: WorkcardQuery | null): WorkcardQueryWire => clean({
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

  const decodeWorkcardQuery = (wire?: WorkcardQueryWire | WorkcardQuery | null): WorkcardQuery => {
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

  const encodeSummaryQuery = (query: SummaryQuery): SummaryQueryWire => clean({
    parents: encodeList(query.parents) ?? '',
    kind: query.kind,
    type: encodeList(query.type),
  })

  const decodeSummaryQuery = (wire?: SummaryQueryWire | SummaryQuery | null): SummaryQuery => {
    const value = asRecord(wire)
    return clean({
      parents: decodeList(value.parents, 'parents') ?? [],
      kind: decodeText(value.kind) as WorkcardKind | undefined,
      type: decodeOneOrMany(value.type, 'type'),
    })
  }

  const encodeTransitionQuery = (query?: TransitionQuery | null): TransitionQueryWire => clean({
    ...encodeListOptions(query),
    card: query?.card,
    project: query?.project,
    sinceSeq: query?.sinceSeq,
    action: encodeList(query?.action),
    state: query?.state,
  })

  const decodeTransitionQuery = (wire?: TransitionQueryWire | TransitionQuery | null): TransitionQuery => {
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

  const encodeSpecificationQuery = (query?: SpecificationQuery | null): SpecificationQueryWire => clean({
    ...encodeListOptions(query),
    category: encodeList(query?.category),
    all: query?.all,
  })

  const decodeSpecificationQuery = (wire?: SpecificationQueryWire | SpecificationQuery | null): SpecificationQuery => {
    const value = asRecord(wire)
    return clean({
      ...decodeListOptions<Specification>(value),
      category: decodeOneOrMany(value.category, 'category'),
      all: decodeBoolean(value.all),
    })
  }

  const encodeRelationshipQuery = (query?: RelationshipQuery | null): RelationshipQueryWire => clean({
    ...encodeListOptions(query),
    from: encodeList(query?.from),
    to: encodeList(query?.to),
    type: encodeList(query?.type), fromKind: query?.fromKind, toKind: query?.toKind,
  })

  const decodeRelationshipQuery = (wire?: RelationshipQueryWire | RelationshipQuery | null): RelationshipQuery => {
    const value = asRecord(wire)
    return clean({
      ...decodeListOptions(value),
      from: decodeOneOrMany(value.from, 'from'),
      to: decodeOneOrMany(value.to, 'to'),
      type: decodeOneOrMany(value.type, 'type'),
      fromKind: value.fromKind, toKind: value.toKind,
    }) as RelationshipQuery
  }

  return {
    encodeList, decodeList, encodeSort, decodeSort,
    encodeWorkcardQuery, decodeWorkcardQuery,
    encodeSummaryQuery, decodeSummaryQuery,
    encodeTransitionQuery, decodeTransitionQuery,
    encodeSpecificationQuery, decodeSpecificationQuery,
    encodeRelationshipQuery, decodeRelationshipQuery,
  }
}

export const wireHelper = createWireHelper()
