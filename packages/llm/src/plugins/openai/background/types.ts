import type { ModelEffort } from '@owlmeans/llm-common'
import type { ModelConfig } from '../../../types.js'
import type { LlmFetch } from '../../transport/types.js'
import type { LlmStreamResume } from '../../types.js'
import type { BackgroundMode } from './consts.js'

/** How long the background splice waits on what, and how often it tries again. */
export interface BackgroundTimings {
  /**
   * Byte silence on a running response's stream before its status is polled — and the longest a
   * resumed stream may take to send its headers (OpenAI sends them with its first record).
   */
  silenceMs: number
  /** Bound of one status poll. */
  pollTimeoutMs: number
  /** Bound of the cancellation request sent for an abandoned response. */
  cancelTimeoutMs: number
  /** Failed polls or resumes in a row after which the body fails as a stalled stream. */
  maxResumes: number
  /** Pause before the next try after a failed poll or resume, times the failures so far. */
  retryDelayMs: number
}

export interface OpenAiBackgroundOptions extends Partial<BackgroundTimings> {
  /** Where the requests go; the global fetch, read at call time, when omitted. */
  fetch?: LlmFetch
}

/** OpenAI background mode on the direct route: which clients get it, and the fetch that runs it. */
export interface OpenAiBackgroundHelper {
  /**
   * The background-aware fetch a direct-route Responses client is BUILT with, marked with its mode —
   * or `undefined` when the config turns background mode off. It changes nothing by itself: every
   * request passes through it unchanged except a streamed POST `/responses` whose body asks for
   * `background: true`, which only a `refine` adds (a non-streamed one has the flag removed).
   */
  fetchFor: (config: Pick<ModelConfig, 'background'>) => LlmFetch | undefined
  /** The mode a client's fetch was built with; `undefined` for any other fetch (a transport's, the SDK's own). */
  modeOf: (fetch: unknown) => BackgroundMode | undefined
  /** Whether an attempt at `effort` asks in background on a client built with `mode`. */
  wants: (mode: BackgroundMode, effort: ModelEffort | undefined) => boolean
  /**
   * The same background-aware fetch for ONE attempt, reporting every resume to `onResume`; any
   * fetch {@link modeOf} does not recognise is answered as it is.
   */
  observed: (fetch: LlmFetch, onResume: (event: LlmStreamResume) => void) => LlmFetch
}

/** What a background-aware fetch carries under {@link BACKGROUND_FETCH}. */
export interface BackgroundMark {
  mode: BackgroundMode
  /** The same fetch reporting each resume to `onResume`. */
  observed: (onResume: (event: LlmStreamResume) => void) => LlmFetch
}

/** One background request whose stream is spliced. */
export interface BackgroundRequest {
  /** The POST's URL without its query: the response resource is `<url>/<id>`. */
  url: string
  /** The POST's headers — the poll, the resume and the cancellation authenticate with them. */
  headers: Headers
  /** The SDK's signal: an abort ends the stream and cancels the response. */
  signal?: AbortSignal | undefined
  /** Hears every resume — the attempt's observer. */
  onResume?: ((event: LlmStreamResume) => void) | undefined
}

/** The stream behind a background POST, kept whole across drops. */
export interface BackgroundSplice {
  /**
   * The response the SDK reads for a background POST answered with `first`: only complete SSE
   * records are forwarded (a torn tail at a drop is dropped); the response id (from the first event
   * naming it) and the last forwarded `sequence_number` are tracked — a keepalive's number is the
   * connection's own and never counts. On a drop, or `silenceMs` of
   * byte silence, the response is polled — `: poll` is added while it is queued or in progress — and
   * the stream resumed after the last forwarded event (the old reader cancelled first), replayed
   * events dropped. After a terminal event the stream closes with its upstream and is never
   * resumed. `maxResumes` failures in a row fail the body with `LlmModelError('stream-stalled:…')`.
   * An abort or a cancelled body cancels a known, unfinished response once, under its own timeout.
   */
  splice: (request: BackgroundRequest, first: Response) => Response
}

/** What a background stream tracks of one SSE record. */
export interface SseEvent {
  type?: string | undefined
  sequence?: number | undefined
  responseId?: string | undefined
  /** `item_id` of a text or arguments delta. */
  itemId?: string | undefined
  /** `content_index` of a text delta. */
  contentIndex?: number | undefined
  /** The delta's text. */
  delta?: string | undefined
  /** The item of an `output_item.added` / `output_item.done` event. */
  item?: StoredItem | undefined
}

/** One output item of a stored response, as `GET /v1/responses/{id}` answers it. */
export interface StoredItem {
  id?: string
  type?: string
  content?: { type?: string, text?: string }[]
  arguments?: string
  [key: string]: unknown
}

/** A stored response, as `GET /v1/responses/{id}` answers it. */
export interface StoredResponse {
  id?: string
  status?: string
  output?: StoredItem[]
  [key: string]: unknown
}

/** What a background stream has already handed the SDK of each output item. */
export interface SpliceDelivered {
  /** Items whose `output_item.added` was forwarded. */
  added: Set<string>
  /** Items whose `output_item.done` was forwarded. */
  done: Set<string>
  /** Characters forwarded: `t:<item>:<content index>` of text, `a:<item>` of function arguments. */
  sent: Map<string, number>
}

/** Reading SSE records, and writing the ones a stored response still owes the SDK. */
export interface SseRecordHelper {
  /** What one complete record says about the stream; `undefined` for one with nothing to track (a comment). */
  eventOf: (record: string) => SseEvent | undefined
  /** Note a forwarded event in `delivered`. */
  note: (delivered: SpliceDelivered, event: SseEvent) => void
  /**
   * The SSE records that finish a stream from its stored response: for each output item what was
   * not forwarded yet — its `added`, the rest of its text or arguments as one delta, its `done` —
   * then the terminal event carrying the whole response. Numbered after `after`.
   */
  remainderOf: (response: StoredResponse, delivered: SpliceDelivered, after: number) => string
}

/** One read of the background stream's sources, raced against the quiet timer. */
export type SpliceRead =
  | { kind: 'data', value: Uint8Array }
  | { kind: 'end' }
  | { kind: 'error', error: unknown }
  | { kind: 'silence' }
  | { kind: 'resumed', reader: ReadableStreamDefaultReader<Uint8Array> | undefined }
