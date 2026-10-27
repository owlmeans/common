import type { SignalUtils } from './signal/types.js'

/** The deadline and the wait the four platform API clients share. */
export const createSignalUtils = (): SignalUtils => {
  const aborted = (signal: AbortSignal): unknown => {
    if (signal.reason != null) {
      return signal.reason
    }
    const error = new Error('The operation was aborted.')
    error.name = 'AbortError'

    return error
  }

  const deadline: SignalUtils['deadline'] = (timeoutMs, signal) => {
    const timeout = AbortSignal.timeout(timeoutMs)
    if (signal == null) {
      return timeout
    }
    if (typeof AbortSignal.any === 'function') {
      return AbortSignal.any([signal, timeout])
    }
    const controller = new AbortController()
    const abort = (): void => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    timeout.addEventListener('abort', abort, { once: true })

    return controller.signal
  }

  const pause: SignalUtils['pause'] = async (ms, signal) => {
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted === true) {
        reject(aborted(signal))
        return
      }
      if (ms <= 0) {
        resolve()
        return
      }
      const abort = (): void => {
        clearTimeout(timer)
        reject(aborted(signal!))
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort)
        resolve()
      }, ms)
      signal?.addEventListener('abort', abort, { once: true })
    })
  }

  return { deadline, pause }
}

export const signalUtils = createSignalUtils()
