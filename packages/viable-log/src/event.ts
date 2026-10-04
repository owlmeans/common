import { TARGET_EVENT_MARKER, TARGET_EVENT_MAX, TARGET_EVENT_VERSION } from './consts.js'
import type { TargetEvent } from './types.js'

const LEVELS = ['debug', 'info', 'warn', 'error']

/** The stdout line of an event. Over-long ones lose their stack, then their data — never their head. */
export const targetEventLine = (event: TargetEvent): string => {
  let line = TARGET_EVENT_MARKER + JSON.stringify(event)
  if (line.length > TARGET_EVENT_MAX && event.error?.stack != null) {
    line = TARGET_EVENT_MARKER + JSON.stringify({ ...event, error: { ...event.error, stack: undefined } })
  }
  if (line.length > TARGET_EVENT_MAX) {
    line = TARGET_EVENT_MARKER + JSON.stringify({ ...event, data: undefined })
  }
  return line.length > TARGET_EVENT_MAX ? line.slice(0, TARGET_EVENT_MAX) : line
}

const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' ? value.slice(0, max) : undefined

/**
 * The event a stdout line carries, or `undefined` when the line is not one — absent marker, broken
 * JSON, unknown version, or a shape the platform does not accept. The input is untrusted: it is
 * written by generated code, and nothing outside this function may read fields of it unchecked.
 */
export const parseTargetEventLine = (line: string): TargetEvent | undefined => {
  const at = line.indexOf(TARGET_EVENT_MARKER)
  if (at < 0 || line.length > TARGET_EVENT_MAX + 64) {
    return undefined
  }
  let raw: unknown
  try {
    raw = JSON.parse(line.slice(at + TARGET_EVENT_MARKER.length))
  } catch {
    return undefined
  }
  if (raw == null || typeof raw !== 'object') {
    return undefined
  }
  const event = raw as Record<string, unknown>
  if (event.v !== TARGET_EVENT_VERSION || (event.kind !== 'error' && event.kind !== 'analytics')
    || typeof event.ts !== 'number' || !LEVELS.includes(event.level as string)) {
    return undefined
  }
  const error = event.error != null && typeof event.error === 'object' ? event.error as Record<string, unknown> : undefined

  return {
    v: TARGET_EVENT_VERSION,
    kind: event.kind,
    ts: event.ts,
    level: event.level as TargetEvent['level'],
    scope: text(event.scope, 200) ?? 'target',
    message: text(event.message, 2000) ?? '',
    event: text(event.event, 200),
    data: event.data,
    error: error != null
      ? {
        name: text(error.name, 200) ?? 'Error', message: text(error.message, 2000) ?? '',
        stack: text(error.stack, 8000), incidentId: text(error.incidentId, 100),
      }
      : undefined,
  }
}
