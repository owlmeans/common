import type { AttemptObserver } from '../observer/types.js'

/** How long a stream may keep delivering usage after its finish (see `STREAM_DRAIN_*`). */
export interface StreamDrain {
  /** At most this many reads after the finish. */
  reads: number
  /** Within this fixed window; never longer than the connection deadline. */
  windowMs: number
}

/** The attempt's traffic, for a stream whose client the plugin handed an observer. */
export interface StreamLiveness {
  /** The attempt's observer: its bytes re-arm the connection deadline, its first request arms the progress one. */
  observer: AttemptObserver
  /** The progress deadline (ms); it runs at `max(progressMs, timeoutMs)`. */
  progressMs: number
}

/** Reading a model stream. */
export interface StreamUtils {
  /**
   * Extract `finish_reason` from a stream chunk regardless of whether it is a plain
   * `AIMessageChunk` (ask/talk) or a `{ raw, parsed }` combined chunk (structured output).
   */
  getChunkFinishReason: (chunk: unknown) => string | undefined
  /**
   * Iterate a model stream under a CONNECTION deadline and, with `liveness`, a PROGRESS deadline.
   * `start` receives an `AbortSignal` to forward to `model.stream(..., { signal })`. The connection
   * timer is re-armed on every received chunk and on every byte the attempt's observer hears, so it
   * only fires after `timeoutMs` of SILENCE — a provider that accepted the request but sends
   * nothing more. The progress timer is armed once the observer saw a request leave and re-armed
   * by chunks only, at `max(liveness.progressMs, timeoutMs)`: a connection kept alive by keepalives
   * with no content behind them. On either, the call is aborted and surfaced as a retryable
   * {@link LlmModelError} (`stream-stalled:`) independently of SDK cancellation settling. Both
   * stream creation and iterator reads race the deadlines; late results and cleanup cannot delay or
   * resume the failed call. Without `liveness` only chunks re-arm, and nothing else changes. The
   * observer is disarmed at the finish and when the stream ends: late bytes re-arm nothing.
   *
   * After the first chunk carrying a non-empty `finish_reason` the stream DRAINS: at most
   * `drain.reads` more reads within a fixed `drain.windowMs`, yielding only usage-only chunks
   * (token counts, no content, no tool-call chunk, no finish reason) and then ending quietly — a
   * silence, an error or a timeout there is not a failure of the call. Some providers send the
   * final SSE data event twice, which makes `AIMessageChunk.concat()` double-append every string
   * field (`finish_reason` becomes `'stopstop'`) and corrupts accumulated tool-call arguments, so a
   * repeated finish is never yielded; Chat Completions sends the usage AFTER the finish, so it is.
   */
  streamWithDeadline: <T>(
    start: (signal: AbortSignal) => Promise<AsyncIterable<T>>,
    timeoutMs?: number,
    drain?: StreamDrain,
    liveness?: StreamLiveness,
  ) => AsyncGenerator<T>
  /** Whether a chunk carries token usage and nothing else — what a drain lets through. */
  isUsageOnly: (chunk: unknown) => boolean
}
