import { LimitError } from '../errors.js'
import type { ComposedSignal, SignalUtils } from './signals/types.js'

export const createSignalUtils = (): SignalUtils => {
  const onAbort = (signal: AbortSignal | undefined, listener: (reason: unknown) => void): () => void => {
    if (signal == null) {
      return () => undefined
    }
    if (signal.aborted) {
      // Deferred, so a caller can finish wiring (its own release, its handlers) before it runs.
      let active = true
      queueMicrotask(() => { if (active) listener(signal.reason) })
      return () => { active = false }
    }
    const handler = (): void => listener(signal.reason)
    signal.addEventListener('abort', handler, { once: true })

    return () => signal.removeEventListener('abort', handler)
  }

  const compose = (
    signals: Array<AbortSignal | undefined>, timeoutMs?: number, reason: () => Error = () => new LimitError('timeout')
  ): ComposedSignal => {
    const controller = new AbortController()
    const releases: Array<() => void> = []
    let timer: NodeJS.Timeout | undefined

    const dispose = (): void => {
      if (timer != null) {
        clearTimeout(timer)
        timer = undefined
      }
      releases.splice(0).forEach(release => release())
    }

    for (const parent of signals) {
      releases.push(onAbort(parent, cause => {
        controller.abort(cause)
        dispose()
      }))
    }

    if (timeoutMs != null && !controller.signal.aborted) {
      timer = setTimeout(() => {
        controller.abort(reason())
        dispose()
      }, timeoutMs)
      timer.unref?.()
    }

    return { signal: controller.signal, dispose }
  }

  const throwIfAborted = (signal?: AbortSignal): void => {
    if (signal?.aborted === true) {
      throw signal.reason
    }
  }

  return { compose, throwIfAborted, onAbort }
}

export const signalUtils = createSignalUtils()
