import type { BackgroundTimings } from './types.js'

/** When a direct-route Responses client asks in background mode (`ModelConfig.background`). */
export enum BackgroundMode {
  /** A streamed call at effort `high` or above (`background` unset). */
  Auto = 'auto',
  /** Every streamed call (`background: true`). */
  Always = 'always',
}

/** Where a background-aware fetch keeps its mark — on the function object, so it survives `lc_kwargs`. */
export const BACKGROUND_FETCH = Symbol.for('@owlmeans/llm:openai-background')

/**
 * The splice's clock. `silenceMs` is twice the ~30 s keepalive OpenAI sends while events pause: a
 * stream silent that long is polled, and a resumed stream — whose headers OpenAI sends only with its
 * first record — may take that long to answer. `maxResumes` failed polls or resumes in a row end the
 * body as a stalled stream, which the model retries without climbing.
 */
export const BACKGROUND_TIMINGS: BackgroundTimings = {
  silenceMs: 60_000,
  pollTimeoutMs: 15_000,
  cancelTimeoutMs: 10_000,
  maxResumes: 3,
  retryDelayMs: 1_000,
}

/** The events after which a response produces nothing more: its stream is never resumed past one. */
export const BACKGROUND_TERMINAL_EVENTS: readonly string[] = [
  'response.completed', 'response.incomplete', 'response.failed', 'error',
]

/**
 * OpenAI's keepalive record (`{"type":"keepalive","sequence_number":N}`, every ~30 s while events
 * pause). Its number counts the connection's keepalives, not the response's events.
 */
export const BACKGROUND_KEEPALIVE_EVENT = 'keepalive'

/** The statuses of a response OpenAI is still working on. */
export const BACKGROUND_LIVE_STATUSES: readonly string[] = ['queued', 'in_progress']

/**
 * The finished statuses whose stored response completes a stream, and the terminal event each ends
 * it with. A `cancelled` (or unknown) one is not among them: nothing comes of it.
 */
export const BACKGROUND_STORED_ENDINGS: Readonly<Record<string, string>> = {
  completed: 'response.completed',
  incomplete: 'response.incomplete',
  failed: 'response.failed',
}

/** The SSE comment a provider-confirmed poll adds to the stream: bytes the attempt's observer counts. */
export const BACKGROUND_POLL_COMMENT = ': poll\n\n'

/** The endpoint a background request is created on. */
export const RESPONSES_PATH = '/responses'

/** The blank line that ends one SSE record. */
export const SSE_RECORD_BOUNDARY = /\r?\n\r?\n/
