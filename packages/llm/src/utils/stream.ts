import { LlmModelError } from '../errors.js'
import { MODEL_STREAM_TIMEOUT_MS } from '../consts.js'

/**
 * Extract `finish_reason` from a stream chunk regardless of whether it is a plain
 * `AIMessageChunk` (ask/talk) or a `{ raw, parsed }` combined chunk (structured output).
 */
export const getChunkFinishReason = (chunk: unknown): string | undefined => {
  const c = chunk as {
    response_metadata?: { finish_reason?: string }
    raw?: { response_metadata?: { finish_reason?: string } }
  }
  return c.response_metadata?.finish_reason ?? c.raw?.response_metadata?.finish_reason
}

/**
 * Iterate a model stream under an IDLE (inactivity) deadline. `start` receives an
 * `AbortSignal` to forward to `model.stream(..., { signal })`; the timer is re-armed on
 * every received chunk, so it only fires after `timeoutMs` of SILENCE — a provider that
 * accepted the request but stalls and never streams another token. On fire the call is
 * aborted and surfaced as a retryable {@link LlmModelError} so the retry escalator moves
 * on instead of hanging forever. Because the timer resets per token, long but actively
 * streaming generations are never aborted.
 *
 * The loop also breaks after the first chunk carrying a non-empty `finish_reason`. Some
 * providers send the final SSE data event twice, which makes `AIMessageChunk.concat()`
 * double-append every string field (`finish_reason` becomes `'stopstop'`, the model name
 * doubles) and corrupts accumulated tool-call argument strings, breaking structured-output
 * parsing. Nothing meaningful arrives after `finish_reason`, so breaking there is safe.
 */
export async function* streamWithDeadline<T>(
  start: (signal: AbortSignal) => Promise<AsyncIterable<T>>,
  timeoutMs: number = MODEL_STREAM_TIMEOUT_MS,
): AsyncGenerator<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout>
  const arm = () => {
    clearTimeout(timer)
    timer = setTimeout(() => controller.abort(), timeoutMs)
  }
  arm()
  try {
    const stream = await start(controller.signal)
    for await (const chunk of stream) {
      arm() // reset the idle timer on each received token
      yield chunk
      const reason = getChunkFinishReason(chunk)
      if (reason != null && reason !== '') break
    }
  } catch (e) {
    if (controller.signal.aborted) {
      throw new LlmModelError(`stream-stalled:no token for ${timeoutMs}ms (idle deadline)`)
    }
    throw e
  } finally {
    clearTimeout(timer!)
  }
}
