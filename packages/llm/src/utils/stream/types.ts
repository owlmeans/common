/** How long a stream may keep delivering usage after its finish (see `STREAM_DRAIN_*`). */
export interface StreamDrain {
  /** At most this many reads after the finish. */
  reads: number
  /** Within this fixed window; never longer than the idle deadline. */
  windowMs: number
}

/** Reading a model stream. */
export interface StreamUtils {
  /**
   * Extract `finish_reason` from a stream chunk regardless of whether it is a plain
   * `AIMessageChunk` (ask/talk) or a `{ raw, parsed }` combined chunk (structured output).
   */
  getChunkFinishReason: (chunk: unknown) => string | undefined
  /**
   * Iterate a model stream under an IDLE (inactivity) deadline. `start` receives an
   * `AbortSignal` to forward to `model.stream(..., { signal })`; the timer is re-armed on
   * every received chunk, so it only fires after `timeoutMs` of SILENCE — a provider that
   * accepted the request but stalls and never streams another token. On fire the call is
   * aborted and surfaced as a retryable {@link LlmModelError} independently of SDK
   * cancellation settling. Both stream creation and iterator reads race the deadline;
   * late results and cleanup cannot delay or resume the failed call. Because the timer
   * resets per token, long but actively streaming generations are never aborted.
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
  ) => AsyncGenerator<T>
  /** Whether a chunk carries token usage and nothing else — what a drain lets through. */
  isUsageOnly: (chunk: unknown) => boolean
}
