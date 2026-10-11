/**
 * The property of the preview document's `window` that the platform's injected reporter claims.
 * It holds the reporter's channel ({@link PreviewChannel}) once installed — in a framed preview
 * only, never in a production runtime.
 */
export const PREVIEW_REPORTER_FLAG = '__owlmeansPreviewReporter'

/** The `type` of a preview message that carries an analytics event. Mirrors `PreviewEventType.Analytics`. */
export const PREVIEW_ANALYTICS_TYPE = 'OWLMEANS_PREVIEW_ANALYTICS'

/** The prefix of a stdout line that carries a {@link TargetEvent}. */
export const TARGET_EVENT_MARKER = '[owl:event] '

/** Set to `1` by the platform's publisher in the environment of a target's backend process. */
export const SLOT_EVENTS_ENV = 'OWLMEANS_SLOT_EVENTS'

/** Format version of {@link TargetEvent}. */
export const TARGET_EVENT_VERSION = 1

/** The longest line a backend writes and the publisher accepts: a stack is cut, never a boundary. */
export const TARGET_EVENT_MAX = 16 * 1024
