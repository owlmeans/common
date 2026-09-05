import { UnsupportedArgumentError } from '@owlmeans/resource'
import type { Criteria, Sort } from '@owlmeans/resource'
import type { Document } from 'mongodb'

import type { MongoReference } from '../types.js'
import { marshalCriteria } from './refs.js'

/**
 * Operators mongo speaks natively and that mean the same thing here as they do in SQL and in
 * the in-memory engine. Everything else in the shared vocabulary is rewritten below into a
 * mongo expression with the same meaning — a criteria object has to answer identically
 * whichever store it reaches.
 */
const NATIVE = new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$regex'])

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A SQL `LIKE` pattern as an anchored regular expression: `%` is any run, `_` is one
 * character, and `\` escapes either. The mapping is the one the in-memory engine applies, so
 * the same pattern selects the same records against a collection.
 */
const likeToRegExp = (pattern: string): string => {
  let source = ''
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!
    if (char === '\\' && index + 1 < pattern.length) {
      source += escapeRegExp(pattern[++index]!)
      continue
    }
    if (char === '%') { source += '.*'; continue }
    if (char === '_') { source += '.'; continue }
    source += escapeRegExp(char)
  }

  return `^${source}$`
}

const asArray = (operand: unknown): unknown[] => Array.isArray(operand) ? operand : [operand]

/**
 * One operator as the mongo field expression that answers it.
 *
 * `$exists` and `$null` both become a comparison against `null`, not mongo's own `$exists`:
 * the shared vocabulary asks whether a field *has a value*, which the relational and
 * in-memory stores answer as `IS NULL` / `value == null`. Mongo's `$exists` answers a
 * different question — whether the key is present — and a key present but null would part
 * the three stores over one criteria object.
 *
 * @throws {UnsupportedArgumentError} on an operator this store cannot answer.
 */
const operatorToFilter = (field: string, operator: string, operand: unknown): Document => {
  if (NATIVE.has(operator)) {
    return { [operator]: operand }
  }
  switch (operator) {
    case '$exists':
      return operand === false ? { $eq: null } : { $ne: null }
    case '$null':
      return operand === false ? { $ne: null } : { $eq: null }
    case '$like':
      return { $regex: likeToRegExp(`${operand}`) }
    case '$ilike':
      return { $regex: likeToRegExp(`${operand}`), $options: 'i' }
    case '$startsWith':
      return { $regex: `^${escapeRegExp(`${operand}`)}` }
    case '$endsWith':
      return { $regex: `${escapeRegExp(`${operand}`)}$` }
    case '$between':
      if (!Array.isArray(operand) || operand.length !== 2) {
        throw new UnsupportedArgumentError(`criteria:$between:${field}`)
      }

      return { $gte: operand[0], $lte: operand[1] }
    /** Array membership, mirroring the postgres array operators `@>`, `<@` and `&&`. */
    case '$contains':
      return { $all: asArray(operand) }
    case '$contained':
      /**
       * Nothing outside the operand list may appear in the field. The `$ne: null` keeps an
       * absent field out of the result — `$not` alone is satisfied by a document that has no
       * such field at all, where the relational store answers NULL and matches nothing.
       */
      return { $not: { $elemMatch: { $nin: asArray(operand) } }, $ne: null }
    case '$overlaps':
      return { $in: asArray(operand) }
    default:
      throw new UnsupportedArgumentError(`criteria-operator:${operator}`)
  }
}

/**
 * An object naming at least one `$` key is a spec, not a value to compare against. A Date and
 * an array are values even though both are objects.
 */
const isOperatorSpec = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
  && Object.keys(value).some(key => key.startsWith('$'))

/**
 * One field's criteria as mongo conditions. Operators that translate into the same mongo key —
 * `$like` and `$startsWith` both produce `$regex` — are emitted as separate conditions rather
 * than merged, so neither silently overwrites the other.
 */
const fieldConditions = (field: string, spec: Record<string, unknown>): Document[] => {
  const merged: Document = {}
  const conditions: Document[] = []

  for (const [operator, operand] of Object.entries(spec)) {
    if (operand === undefined) {
      continue
    }
    const fragment = operatorToFilter(field, operator, operand)
    if (Object.keys(fragment).some(key => key in merged)) {
      conditions.push({ [field]: fragment })
      continue
    }
    Object.assign(merged, fragment)
  }

  if (Object.keys(merged).length > 0) {
    conditions.unshift({ [field]: merged })
  }

  return conditions
}

/**
 * Flatten the conditions into one filter document. Mongo reads sibling keys as a conjunction,
 * so only the ones that would overwrite an earlier key — two `$regex` expressions over the
 * same field, say — need an explicit `$and`.
 */
const flatten = (conditions: Document[]): Document => {
  const filter: Document = {}
  const conflicting: Document[] = []

  for (const condition of conditions) {
    if (Object.keys(condition).some(key => key in filter)) {
      conflicting.push(condition)
      continue
    }
    Object.assign(filter, condition)
  }

  if (conflicting.length > 0) {
    filter.$and = [...(Array.isArray(filter.$and) ? filter.$and : []), ...conflicting]
  }

  return filter
}

const build = (criteria: Criteria<any> | undefined): Document[] => {
  const conditions: Document[] = []

  for (const [key, raw] of Object.entries(criteria ?? {})) {
    /**
     * An untouched filter must never empty a list, so `undefined` is skipped rather than
     * compared. `null` asks for the absence of a value.
     */
    if (raw === undefined) {
      continue
    }

    if (key === '$and' || key === '$or') {
      const parts = (Array.isArray(raw) ? raw : [raw])
        .map(part => build(part as Criteria<any>))
        .filter(part => part.length > 0)
        .map(part => flatten(part))
      if (parts.length > 0) {
        conditions.push(key === '$and' ? { $and: parts } : { $or: parts })
      }
      continue
    }
    if (key === '$not') {
      const inner = build(raw as Criteria<any>)
      if (inner.length > 0) {
        /** Mongo has no top level `$not`; `$nor` over a single branch is its negation. */
        conditions.push({ $nor: [flatten(inner)] })
      }
      continue
    }

    if (raw === null) {
      conditions.push({ [key]: { $eq: null } })
      continue
    }
    if (isOperatorSpec(raw)) {
      conditions.push(...fieldConditions(key, raw as Record<string, unknown>))
      continue
    }
    if (Array.isArray(raw)) {
      /**
       * A bare array means "any of these", exactly as it does against a relational store.
       * Exact array equality stays reachable as `{ $eq: [...] }`.
       */
      conditions.push({ [key]: { $in: raw } })
      continue
    }

    conditions.push({ [key]: raw })
  }

  return conditions
}

/**
 * Translate `Criteria<T>` into the filter a collection takes.
 *
 * Two passes: the shared operator vocabulary becomes mongo expressions, then
 * {@link marshalCriteria} converts the values addressed at `_id` or at a declared reference
 * into `ObjectId`s and maps the `id` alias onto `_id`. Both halves are needed — a criteria
 * object carries string ids and portable operators, a collection stores neither.
 *
 * An empty result is an empty filter, which matches everything. Callers that must not act on
 * "everything" — `purge` — check for it themselves.
 *
 * @throws {UnsupportedArgumentError}
 */
export const criteriaToFilter = (
  criteria: Criteria<any> | undefined, refs: Map<string, MongoReference>
): Document => {
  const conditions = build(criteria)
  if (conditions.length < 1) {
    return {}
  }

  return marshalCriteria(flatten(conditions), refs) ?? {}
}

/**
 * Translate `Sort<T>[]` into a mongo sort document. A bare field name is ascending, and `id`
 * addresses `_id` — documents never store an `id` field, so sorting by the name records carry
 * would silently order by nothing.
 */
export const sortToMongo = (sort?: Sort<any>[]): Document | undefined => {
  if (sort == null || sort.length < 1) {
    return undefined
  }

  return sort.reduce<Document>((order, entry) => {
    const [field, direction]: [string, number] = typeof entry === 'string'
      ? [entry, 1]
      : [entry.field, entry.order === 'desc' ? -1 : 1]
    order[field === 'id' ? '_id' : field] = direction

    return order
  }, {})
}
