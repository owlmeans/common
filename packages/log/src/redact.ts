import { MAX_DEPTH, MAX_STRING, REDACTED, SECRET_KEY } from './consts.js'
import {
  BEARER, KEY_TOKEN, KEYED_SECRET, MAX_ERROR_CAUSE_DEPTH, MAX_ERROR_CAUSE_MESSAGE, MAX_ERROR_CAUSE_STACK, MAX_ITEMS,
  REDACTED_BEARER, REDACTED_KEY, UNSERIALIZABLE,
} from './consts.local.js'
import type { RedactHelper } from './redact/types.js'

const clip = (value: string): string =>
  value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (${value.length - MAX_STRING} more)` : value

export const createRedactHelper = (): RedactHelper => {
  const textOf: RedactHelper['textOf'] = value => {
    try {
      if (typeof value === 'string') return value
      if (value == null) return ''
      if (Array.isArray(value)) return value.join('; ')
      return String(value)
    } catch {
      return UNSERIALIZABLE
    }
  }
  /** A field of an SDK error may be a getter that throws; it reads as absent. */
  const read = (target: object, key: string): unknown => {
    try {
      return (target as Record<string, unknown>)[key]
    } catch {
      return undefined
    }
  }
  const messageOf: RedactHelper['messageOf'] = error => textOf(read(error, 'message'))
  // The keyed form runs first: its whole value goes, a key inside it included.
  const errorText = (value: unknown, limit: number): string => {
    const safe = textOf(value).replace(KEYED_SECRET, `$1${REDACTED}`)
      .replace(KEY_TOKEN, REDACTED_KEY)
      .replace(BEARER, REDACTED_BEARER)
    return safe.length > limit ? `${safe.slice(0, limit)}… (${safe.length - limit} more)` : safe
  }
  const nameOf = (error: Error): string => {
    const name = textOf(read(error, 'name'))
    if (name !== '') return name
    const constructor = read(error, 'constructor')
    const constructorName = typeof constructor === 'function' ? textOf(read(constructor, 'name')) : ''
    return constructorName !== '' ? constructorName : 'Error'
  }
  const errorData: RedactHelper['errorData'] = (error, options = {}) => {
    const seen = new WeakSet<Error>()
    const visit = (current: Error, depth: number): Record<string, unknown> => {
      seen.add(current)
      const data: Record<string, unknown> = { name: errorText(nameOf(current), 100),
        message: errorText(read(current, 'message'), depth === 0 ? MAX_STRING : MAX_ERROR_CAUSE_MESSAGE) }
      for (const key of ['code', 'type', 'incidentId'] as const) {
        const value = read(current, key)
        if (typeof value === 'string') data[key] = errorText(value, 100)
        else if (typeof value === 'number' && Number.isFinite(value)) data[key] = value
      }
      const status = read(current, 'status')
      if (typeof status === 'number' && Number.isFinite(status)) data.status = status
      const stack = read(current, 'stack')
      if (typeof stack === 'string' && (depth === 0 || options.causeStacks !== false)) {
        data.stack = errorText(stack, depth === 0 ? MAX_STRING : MAX_ERROR_CAUSE_STACK)
      }
      const cause = read(current, 'cause')
      if (cause instanceof Error) {
        if (depth >= MAX_ERROR_CAUSE_DEPTH || seen.has(cause)) data.causeTruncated = true
        else data.cause = visit(cause, depth + 1)
      }
      return data
    }
    try {
      return visit(error, 0)
    } catch {
      return { name: 'Error', message: UNSERIALIZABLE }
    }
  }

  const redact = (value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown => {
    try {
      if (value == null || typeof value === 'number' || typeof value === 'boolean') {
        return value
      }
      if (typeof value === 'string') {
        return clip(value)
      }
      if (typeof value === 'bigint') {
        return value.toString()
      }
      if (typeof value === 'function' || typeof value === 'symbol') {
        return `[${typeof value}]`
      }
      if (value instanceof Error) {
        return errorData(value)
      }
      const object = value as object
      if (seen.has(object)) {
        return '[circular]'
      }
      if (depth >= MAX_DEPTH) {
        return '[…]'
      }
      seen.add(object)
      // Bytes are content (a file, an upload, a raw body): a record says how many, never which.
      if (ArrayBuffer.isView(object) || object instanceof ArrayBuffer) {
        return `[${object.constructor?.name ?? 'binary'} ${object.byteLength} bytes]`
      }
      if (Array.isArray(object)) {
        const items = object.slice(0, MAX_ITEMS).map(item => redact(item, depth + 1, seen))
        return object.length > MAX_ITEMS ? [...items, `… ${object.length - MAX_ITEMS} more`] : items
      }
      if (object instanceof Date) {
        return object.toISOString()
      }
      if (typeof Headers !== 'undefined' && object instanceof Headers) {
        return redact(Object.fromEntries(object.entries()), depth, seen)
      }
      const out: Record<string, unknown> = {}
      const entries = Object.entries(object)
      for (const [key, item] of entries.slice(0, MAX_ITEMS)) {
        out[key] = SECRET_KEY.test(key) && item != null && item !== '' ? REDACTED : redact(item, depth + 1, seen)
      }
      if (entries.length > MAX_ITEMS) {
        out['…'] = `${entries.length - MAX_ITEMS} more`
      }
      return out
    } catch {
      return UNSERIALIZABLE
    }
  }

  return { errorData, redact, textOf, messageOf }
}

export const redactHelper = createRedactHelper()
