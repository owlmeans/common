import { UnsupportedArgumentError } from '@owlmeans/resource'
import type { ListCriteria, ListSort, ResourceRecord } from '@owlmeans/resource'

/**
 * In-memory evaluation of `ListCriteria`.
 *
 * The operator set mirrors `@owlmeans/postgres-resource` on purpose: one criteria shape has to
 * mean the same thing whether a list is filtered in SQL by an endpoint or locally by a screen
 * reading the state resource. A client that learns `{ status: ['open', 'done'] }` means "either
 * of these" must not meet a different answer when the same object reaches the server.
 *
 * Two deliberate differences, both because a state resource carries no schema:
 *
 * - An unknown key cannot be detected. Postgres throws on one (a typo silently widening a query
 *   to the whole table is worth being loud about); here the property is simply absent from the
 *   record, so the record does not match. There is nothing to compare it against.
 * - There is no jsonb/column distinction, so a dotted key always reaches into the record.
 */

const COMPARISON = new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte'])

/** Dates compare by instant; everything else compares as it is. */
const comparable = (value: unknown): unknown =>
  value instanceof Date ? value.getTime() : value

/** Reach `profile.city` inside a record. A missing step yields `undefined`, never a throw. */
const reach = (record: unknown, path: string[]): unknown =>
  path.reduce<unknown>(
    (value, step) => value == null || typeof value !== 'object'
      ? undefined
      : (value as Record<string, unknown>)[step],
    record
  )

/**
 * An object naming at least one `$` key is a spec, not a value to compare against.
 * A Date and an array are values even though both are objects.
 */
const isOperatorSpec = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
  && Object.keys(value).some(key => key.startsWith('$'))

const equal = (left: unknown, right: unknown): boolean => {
  if (left instanceof Date || right instanceof Date) {
    return comparable(left) === comparable(right)
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((entry, index) => equal(entry, right[index]))
  }
  return left === right
}

/** `$in` / `$nin`. `null` in the list matches an absent property, matching the SQL widening. */
const inList = (value: unknown, operand: unknown): boolean => {
  const values = Array.isArray(operand) ? operand : [operand]
  return values.some(entry => entry == null ? value == null : equal(value, entry))
}

const text = (value: unknown): string => value == null ? '' : `${value}`

/** `%` and `_` are the SQL wildcards; `\` escapes them. */
const likeToRegExp = (pattern: string, flags: string): RegExp => {
  let source = ''
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!
    if (char === '\\' && index + 1 < pattern.length) {
      source += pattern[++index]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      continue
    }
    if (char === '%') { source += '.*'; continue }
    if (char === '_') { source += '.'; continue }
    source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  return new RegExp(`^${source}$`, flags)
}

/**
 * @throws {UnsupportedArgumentError} on an operator this store cannot answer.
 */
const applyOperators = (value: unknown, spec: Record<string, unknown>): boolean => {
  for (const [operator, operand] of Object.entries(spec)) {
    if (COMPARISON.has(operator)) {
      const left = comparable(value)
      const right = comparable(operand)
      const matched =
        operator === '$eq' ? equal(value, operand)
          : operator === '$ne' ? !equal(value, operand)
            : left == null || right == null ? false
              : operator === '$gt' ? (left as never) > (right as never)
                : operator === '$gte' ? (left as never) >= (right as never)
                  : operator === '$lt' ? (left as never) < (right as never)
                    : (left as never) <= (right as never)
      if (!matched) return false
      continue
    }
    switch (operator) {
      case '$in':
        if (!inList(value, operand)) return false
        break
      case '$nin':
        if (inList(value, operand)) return false
        break
      case '$exists':
        if ((value != null) !== (operand !== false)) return false
        break
      case '$null':
        if ((value == null) !== (operand !== false)) return false
        break
      case '$like':
        if (!likeToRegExp(text(operand), '').test(text(value))) return false
        break
      case '$ilike':
        if (!likeToRegExp(text(operand), 'i').test(text(value))) return false
        break
      case '$regex':
        if (!new RegExp(text(operand)).test(text(value))) return false
        break
      case '$startsWith':
        if (!text(value).startsWith(text(operand))) return false
        break
      case '$endsWith':
        if (!text(value).endsWith(text(operand))) return false
        break
      case '$between': {
        if (!Array.isArray(operand) || operand.length !== 2) {
          throw new UnsupportedArgumentError(`criteria:$between`)
        }
        const left = comparable(value)
        if (left == null) return false
        const from = comparable(operand[0])
        const to = comparable(operand[1])
        if ((left as never) < (from as never) || (left as never) > (to as never)) return false
        break
      }
      case '$contains': {
        const operands = Array.isArray(operand) ? operand : [operand]
        const values = Array.isArray(value) ? value : [value]
        if (!operands.every(entry => values.some(candidate => equal(candidate, entry)))) return false
        break
      }
      case '$contained': {
        const operands = Array.isArray(operand) ? operand : [operand]
        const values = Array.isArray(value) ? value : [value]
        if (!values.every(candidate => operands.some(entry => equal(candidate, entry)))) return false
        break
      }
      case '$overlaps': {
        const operands = Array.isArray(operand) ? operand : [operand]
        const values = Array.isArray(value) ? value : [value]
        if (!values.some(candidate => operands.some(entry => equal(candidate, entry)))) return false
        break
      }
      default:
        throw new UnsupportedArgumentError(`criteria-operator:${operator}`)
    }
  }

  return true
}

/**
 * Whether one record satisfies the criteria.
 *
 * `undefined` as a criteria value is skipped rather than compared — it is what an optional filter
 * looks like when nothing was chosen, and treating it as "must be undefined" makes an unset
 * dropdown filter the list down to nothing.
 *
 * @throws {UnsupportedArgumentError} on an unknown operator.
 */
export const matchCriteria = <T extends ResourceRecord>(
  record: T, criteria?: ListCriteria
): boolean => {
  for (const [key, raw] of Object.entries(criteria ?? {})) {
    if (raw === undefined) {
      continue
    }

    if (key === '$and' || key === '$or') {
      const parts = (Array.isArray(raw) ? raw : [raw]) as ListCriteria[]
      if (parts.length < 1) continue
      const matched = key === '$and'
        ? parts.every(part => matchCriteria(record, part))
        : parts.some(part => matchCriteria(record, part))
      if (!matched) return false
      continue
    }
    if (key === '$not') {
      if (matchCriteria(record, raw as ListCriteria)) return false
      continue
    }

    const value = reach(record, key.split('.'))

    if (raw === null) {
      if (value != null) return false
      continue
    }
    if (isOperatorSpec(raw)) {
      if (!applyOperators(value, raw as Record<string, unknown>)) return false
      continue
    }
    if (Array.isArray(raw)) {
      /**
       * A bare array means "any of these", exactly as it does against a relational store.
       * Exact array equality stays reachable as `{ $eq: [...] }`.
       */
      if (!inList(value, raw)) return false
      continue
    }
    if (!equal(value, raw)) return false
  }

  return true
}

/** Every record the criteria accepts, in insertion order. */
export const filterRecords = <T extends ResourceRecord>(
  records: T[], criteria?: ListCriteria
): T[] => criteria == null || Object.keys(criteria).length < 1
    ? [...records]
    : records.filter(record => matchCriteria(record, criteria))

/**
 * Sort a copy by `ListPager.sort`. `[field, true]` is descending — the same mapping mongo's
 * `order ? -1 : 1` and the postgres builder use, so a pager written for one store orders the
 * same way against another.
 */
export const sortRecords = <T extends ResourceRecord>(records: T[], sort?: ListSort[]): T[] => {
  if (sort == null || sort.length < 1) {
    return [...records]
  }

  const rules = sort.map(entry => Array.isArray(entry)
    ? { field: entry[0], desc: entry[1] === true }
    : { field: entry, desc: false })

  return [...records].sort((left, right) => {
    for (const { field, desc } of rules) {
      const a = comparable(reach(left, field.split('.')))
      const b = comparable(reach(right, field.split('.')))
      if (a == null && b == null) continue
      /** An absent value sorts last ascending, which is where a reader expects "no value". */
      if (a == null) return 1
      if (b == null) return -1
      if ((a as never) < (b as never)) return desc ? 1 : -1
      if ((a as never) > (b as never)) return desc ? -1 : 1
    }

    return 0
  })
}
