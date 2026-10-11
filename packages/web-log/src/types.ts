import type { AnalyticsEvent } from '@owlmeans/log'

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

export interface DataLayerWindow {
  dataLayer?: unknown[]
}
