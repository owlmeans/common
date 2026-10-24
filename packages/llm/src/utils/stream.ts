import { LlmModelError } from '../errors.js'
import { MODEL_STREAM_TIMEOUT_MS } from '../consts.js'
import { STREAM_DRAIN_MS, STREAM_DRAIN_READS } from './stream/consts.js'
import type { StreamDrain, StreamUtils } from './stream/types.js'

export const createStreamUtils = (): StreamUtils => {
  const getChunkFinishReason = (chunk: unknown): string | undefined => {
    const c = chunk as {
      response_metadata?: { finish_reason?: string }
      raw?: { response_metadata?: { finish_reason?: string } }
    }
    return c.response_metadata?.finish_reason ?? c.raw?.response_metadata?.finish_reason
  }

  const isUsageOnly = (chunk: unknown): boolean => {
    const message = ((chunk as { raw?: unknown }).raw ?? chunk) as {
      usage_metadata?: unknown, content?: unknown, tool_call_chunks?: unknown[], tool_calls?: unknown[]
    }
    const content = message.content
    const empty = content == null || content === '' || (Array.isArray(content) && content.length === 0)
    const reason = getChunkFinishReason(chunk)

    return message.usage_metadata != null && empty && (reason == null || reason === '')
      && (message.tool_call_chunks?.length ?? 0) === 0 && (message.tool_calls?.length ?? 0) === 0
  }

  async function* streamWithDeadline<T>(
    start: (signal: AbortSignal) => Promise<AsyncIterable<T>>,
    timeoutMs: number = MODEL_STREAM_TIMEOUT_MS,
    drain: StreamDrain = { reads: STREAM_DRAIN_READS, windowMs: STREAM_DRAIN_MS },
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
      let finished = false
      for (;;) {
        const next = await Promise.race([Promise.resolve().then(() => current.next()), idle])
        if (next.done) { closed = true; break }
        const chunk = next.value
        arm() // reset the idle timer on each received token
        yield chunk
        const reason = getChunkFinishReason(chunk)
        if (reason != null && reason !== '') { finished = true; break }
      }
      if (finished) {
        // The drain answers to its own fixed window, never to the idle deadline it replaces.
        disarm()
        // A read that fails, or the window running out, resolves to `null`: the drain just ends.
        let endWindow = () => {}
        const window = new Promise<null>(resolve => {
          const timer = setTimeout(() => resolve(null), Math.min(drain.windowMs, timeoutMs))
          endWindow = () => { clearTimeout(timer); resolve(null) }
        })
        try {
          for (let read = 0; read < drain.reads; read++) {
            const next: IteratorResult<T> | null = await Promise.race([
              Promise.resolve().then(() => current.next()).then(item => item, () => null),
              window,
            ])
            if (next == null) break
            if (next.done === true) { closed = true; break }
            if (isUsageOnly(next.value)) yield next.value
          }
        } finally {
          endWindow()
        }
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

  return { getChunkFinishReason, streamWithDeadline, isUsageOnly }
}

export const streamUtils = createStreamUtils()
