import type { LogPlugin, LogRecord } from '@owlmeans/log'
import { PREVIEW_ANALYTICS_TYPE, PREVIEW_REPORTER_FLAG, SLOT_EVENTS_ENV, TARGET_EVENT_VERSION } from './consts.js'
import { targetEventLine } from './event.js'
import type { PreviewChannel, TargetEvent } from './types.js'

/** The reporter's channel of the current document, or `undefined` outside a framed preview. */
export const previewChannel = (): PreviewChannel | undefined => {
  if (typeof window === 'undefined') {
    return undefined
  }
  const channel = (window as unknown as Record<string, unknown>)[PREVIEW_REPORTER_FLAG] as Partial<PreviewChannel> | undefined
  return channel != null && typeof channel === 'object' && typeof channel.post === 'function'
    ? channel as PreviewChannel : undefined
}

/**
 * The target web's link to the platform: analytics events go to the manager frame that embeds the
 * preview, through the channel the platform's injected reporter owns.
 *
 * It is inert wherever that channel is absent — a production runtime, an unframed page, a server —
 * so it is registered unconditionally and costs nothing for real users. Errors need no help from
 * here: a record carrying an `Error` reaches the reporter's own `console.error` hook through the
 * logger's console sink.
 */
export const viablePreviewPlugin = (): LogPlugin => ({
  name: 'viable-preview',
  track: event => {
    previewChannel()?.post(PREVIEW_ANALYTICS_TYPE, event)
  },
})

interface Stdout { write: (chunk: string) => unknown }

const stdout = (): Stdout | undefined =>
  (globalThis as { process?: { stdout?: Stdout } }).process?.stdout

const slotEventsEnabled = (): boolean =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[SLOT_EVENTS_ENV] === '1'

const errorOf = (record: LogRecord): TargetEvent['error'] => {
  const error = record.error
  if (error == null) {
    return undefined
  }
  const incidentId = (error as { incidentId?: unknown }).incidentId
  return {
    name: error.name, message: error.message, stack: error.stack,
    incidentId: typeof incidentId === 'string' ? incidentId : undefined,
  }
}

/**
 * The target backend's link to the platform. When the publisher that runs the process asks for it
 * (`OWLMEANS_SLOT_EVENTS=1`), every error-level record and every analytics event becomes one marked
 * JSON line on stdout; the publisher takes it from there. Elsewhere — a production pod, a laptop —
 * the plugin does nothing.
 */
export const viableSlotPlugin = (): LogPlugin => {
  const emit = (event: TargetEvent): void => {
    const out = stdout()
    if (out != null && slotEventsEnabled()) {
      out.write(`${targetEventLine(event)}\n`)
    }
  }
  return {
    name: 'viable-slot',
    log: record => {
      if (record.level !== 'error') {
        return
      }
      emit({
        v: TARGET_EVENT_VERSION, kind: 'error', ts: record.time, level: 'error', scope: record.scope,
        message: record.message, event: record.event, data: record.data, error: errorOf(record),
      })
    },
    track: event => {
      emit({
        v: TARGET_EVENT_VERSION, kind: 'analytics', ts: event.time, level: event.level, scope: event.scope,
        message: event.message, event: event.event, data: event.data,
      })
    },
  }
}
