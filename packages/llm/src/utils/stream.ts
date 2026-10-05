import { LlmModelError } from '../errors.js'
import { MODEL_STREAM_TIMEOUT_MS } from '../consts.js'
import type { StreamUtils } from './stream/types.js'

export const createStreamUtils = (): StreamUtils => {
  const getChunkFinishReason = (chunk: unknown): string | undefined => {
    const c = chunk as {
      response_metadata?: { finish_reason?: string }
      raw?: { response_metadata?: { finish_reason?: string } }
    }
    return c.response_metadata?.finish_reason ?? c.raw?.response_metadata?.finish_reason
  }

  async function* streamWithDeadline<T>(
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

  return { getChunkFinishReason, streamWithDeadline }
}

export const streamUtils = createStreamUtils()
