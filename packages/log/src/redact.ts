import { MAX_DEPTH, MAX_STRING, REDACTED, SECRET_KEY } from './consts.js'
import { MAX_ERROR_CAUSE_DEPTH, MAX_ERROR_CAUSE_MESSAGE, MAX_ERROR_CAUSE_STACK, MAX_ITEMS } from './consts.local.js'
import type { RedactHelper } from './redact/types.js'

const clip = (value: string): string =>
  value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (${value.length - MAX_STRING} more)` : value

export const createRedactHelper = (): RedactHelper => {
  const errorText = (value: string, limit: number): string => {
    const safe = value.replace(/\bsk-[A-Za-z0-9_*.-]+/g, '[redacted-key]')
      .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
      .replace(/((?:authorization|cookie|password|api[_-]?key|access[_-]?token)\s*[:=]\s*)[^\r\n]+/gi, '$1[redacted]')
    return safe.length > limit ? `${safe.slice(0, limit)}… (${safe.length - limit} more)` : safe
  }
  const errorData: RedactHelper['errorData'] = (error, options = {}) => {
    const seen = new WeakSet<Error>()
    const visit = (current: Error, depth: number): Record<string, unknown> => {
      seen.add(current)
      const data: Record<string, unknown> = { name: errorText(current.name, 100),
        message: errorText(current.message, depth === 0 ? MAX_STRING : MAX_ERROR_CAUSE_MESSAGE) }
      const extra = current as Error & { code?: unknown, incidentId?: unknown, type?: unknown, status?: unknown }
      for (const key of ['code', 'type', 'incidentId'] as const) {
        if (typeof extra[key] === 'string') data[key] = errorText(extra[key], 100)
        else if (typeof extra[key] === 'number' && Number.isFinite(extra[key])) data[key] = extra[key]
      }
      if (typeof extra.status === 'number' && Number.isFinite(extra.status)) data.status = extra.status
      if (current.stack != null && (depth === 0 || options.causeStacks !== false)) {
        data.stack = errorText(current.stack, depth === 0 ? MAX_STRING : MAX_ERROR_CAUSE_STACK)
      }
      if (current.cause instanceof Error) {
        if (depth >= MAX_ERROR_CAUSE_DEPTH || seen.has(current.cause)) data.causeTruncated = true
        else data.cause = visit(current.cause, depth + 1)
      }
      return data
    }
    return visit(error, 0)
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
      return '[unserializable]'
    }
  }

  return { errorData, redact }
}

export const redactHelper = createRedactHelper()
