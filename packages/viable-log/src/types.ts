import type { AnalyticsEvent } from '@owlmeans/log'

/** What a preview document's reporter offers a plugin: send one message to the manager frame. */
export interface PreviewChannel {
  v: number
  post: (type: string, payload: unknown) => void
}

export type TargetEventKind = 'error' | 'analytics'

/**
 * One event of a target's BACKEND process, as a single stdout line (`TARGET_EVENT_MARKER` + JSON).
 *
 * The publisher runs the process, so the line is the only channel it needs: it is parsed there,
 * kept out of the application's own output and relayed to the platform.
 */
export interface TargetEvent {
  v: number
  kind: TargetEventKind
  /** Epoch milliseconds. */
  ts: number
  level: 'debug' | 'info' | 'warn' | 'error'
  scope: string
  message: string
  /** The analytics event name, or the `event` an error record carried. */
  event?: string
  data?: unknown
  error?: { name: string, message: string, stack?: string, incidentId?: string }
}

/** The payload of a preview `Analytics` message (browser → manager). */
export type PreviewAnalyticsPayload = AnalyticsEvent
