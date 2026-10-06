import { MAX_DEPTH, MAX_STRING, REDACTED, SECRET_KEY } from './consts.js'
import { MAX_ITEMS } from './consts.local.js'
import type { RedactHelper } from './redact/types.js'

const clip = (value: string): string =>
  value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (${value.length - MAX_STRING} more)` : value

export const createRedactHelper = (): RedactHelper => {
  const errorData = (error: Error): Record<string, unknown> => {
    const data: Record<string, unknown> = { name: error.name, message: clip(error.message) }
    const extra = error as Error & { code?: unknown, incidentId?: unknown, type?: unknown }
    if (extra.code != null) data.code = extra.code
    if (extra.type != null) data.type = extra.type
    if (extra.incidentId != null) data.incidentId = extra.incidentId
    if (error.stack != null) data.stack = clip(error.stack)
    return data
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
      return '[unserializable]'
    }
  }

  return { errorData, redact }
}

export const redactHelper = createRedactHelper()
