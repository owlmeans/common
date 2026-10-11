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
   * The loop also breaks after the first chunk carrying a non-empty `finish_reason`. Some
   * providers send the final SSE data event twice, which makes `AIMessageChunk.concat()`
   * double-append every string field (`finish_reason` becomes `'stopstop'`, the model name
   * doubles) and corrupts accumulated tool-call argument strings, breaking structured-output
   * parsing. Nothing meaningful arrives after `finish_reason`, so breaking there is safe.
   */
  streamWithDeadline: <T>(
    start: (signal: AbortSignal) => Promise<AsyncIterable<T>>,
    timeoutMs?: number,
  ) => AsyncGenerator<T>
}
