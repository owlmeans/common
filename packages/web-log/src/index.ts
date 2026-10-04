import { CONSENT_ANALYTICS, isConsented } from '@owlmeans/consent'
import type { AnalyticsEvent, LogPlugin } from '@owlmeans/log'

export interface ConsentedAnalyticsOptions {
  /** Plugin name; a second plugin of the same name replaces the first. */
  name?: string
  /** The consent category that must be granted. Default: analytics. */
  category?: string
  /** Event names this plugin sends. Absent means every event. */
  allow?: string[]
  /** Reshape an event; return `undefined` to drop it. */
  map?: (event: AnalyticsEvent) => Record<string, unknown> | undefined
}

/** What the plugin sends by default: the event name and its flat data. */
const defaultPayload = (event: AnalyticsEvent): Record<string, unknown> => {
  const data = event.data
  const flat = data != null && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : data !== undefined ? { value: data } : {}
  return { event: event.event, ...flat }
}

/**
 * An analytics plugin that sends only while a consent category is granted.
 *
 * An event arriving without consent is DROPPED, never queued: a tag manager replays everything
 * already waiting in its queue when it loads, so a held event would be sent after a later grant —
 * for a moment the visitor never agreed to be measured in.
 */
export const consentedAnalyticsPlugin = (
  send: (payload: Record<string, unknown>) => void, options: ConsentedAnalyticsOptions = {}
): LogPlugin => ({
  name: options.name ?? 'web-analytics',
  track: event => {
    if (options.allow != null && !options.allow.includes(event.event)) {
      return
    }
    if (!isConsented(options.category ?? CONSENT_ANALYTICS)) {
      return
    }
    const payload = (options.map ?? defaultPayload)(event)
    if (payload != null) {
      send(payload)
    }
  },
})

export interface DataLayerWindow {
  dataLayer?: unknown[]
}

/**
 * The tag-manager sink: pushes `{ event, ...data }` onto `window.dataLayer`, consent permitting.
 *
 * ```ts
 * addLogPlugin(gtmAnalyticsPlugin({ allow: ['project.created'] }))
 * logger('projects').info('Created', { kind: 'web' }, { analytics: 'project.created' })
 * ```
 */
export const gtmAnalyticsPlugin = (options: ConsentedAnalyticsOptions = {}): LogPlugin =>
  consentedAnalyticsPlugin(payload => {
    if (typeof window === 'undefined') {
      return
    }
    const win = window as unknown as DataLayerWindow
    win.dataLayer = win.dataLayer ?? []
    win.dataLayer.push(payload)
  }, { name: 'gtm', ...options })
