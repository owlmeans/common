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
    let rejectIdle: (error: LlmModelError) => void = () => {}
    const idle = new Promise<never>((_, reject) => { rejectIdle = reject })
    // A consumer may pause at `yield` when the deadline fires.
    void idle.catch(() => {})
    let disarm = () => {}
    const arm = () => {
      disarm()
      const timer = setTimeout(() => {
        controller.abort()
        rejectIdle(new LlmModelError(`stream-stalled:no token for ${timeoutMs}ms (idle deadline)`))
      }, timeoutMs)
      disarm = () => clearTimeout(timer)
    }
    let iterator: AsyncIterator<T> | undefined
    let closed = false
    const close = () => {
      if (iterator == null || closed) return
      closed = true
      // SDK cancellation and iterator cleanup may themselves never settle.
      try { void Promise.resolve(iterator.return?.()).catch(() => {}) } catch {}
    }
    arm()
    try {
      const starting = Promise.resolve().then(() => start(controller.signal)).then(stream => {
        iterator = stream[Symbol.asyncIterator]()
        if (controller.signal.aborted) close()
        return iterator
      })
      const current = await Promise.race([starting, idle])
      for (;;) {
        const next = await Promise.race([Promise.resolve().then(() => current.next()), idle])
        if (next.done) { closed = true; break }
        const chunk = next.value
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
      disarm()
      if (!closed) controller.abort()
      close()
    }
  }

  return { getChunkFinishReason, streamWithDeadline }
}

export const streamUtils = createStreamUtils()
