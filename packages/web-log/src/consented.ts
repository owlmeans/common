import { CONSENT_ANALYTICS, consentStore } from '@owlmeans/consent'
import type { AnalyticsEvent, LogPlugin } from '@owlmeans/log'
import type { ConsentedAnalyticsOptions } from './types.js'

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
    if (!consentStore.granted(options.category ?? CONSENT_ANALYTICS)) {
      return
    }
    const payload = (options.map ?? defaultPayload)(event)
    if (payload != null) {
      send(payload)
    }
  },
})
