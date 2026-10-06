import { TRANSIENT_TRANSPORT_CODES } from './consts.local.js'
import type { TransportHelper } from './transport/types.js'

export const createTransportHelper = (): TransportHelper => {
  const isTransientTransportError = (value: unknown): boolean => {
    const seen = new Set<unknown>()
    let current: unknown = value

    while (current != null && !seen.has(current)) {
      seen.add(current)
      const error = current as { code?: unknown, message?: unknown, cause?: unknown }
      if (typeof error.code === 'string' && TRANSIENT_TRANSPORT_CODES.has(error.code)) return true
      const message = typeof error.message === 'string' ? error.message : String(current)
      if (/\b(?:ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|UND_ERR_(?:CONNECT_TIMEOUT|HEADERS_TIMEOUT|SOCKET))\b/.test(message)) {
        return true
      }
      current = error.cause
    }

    return false
  }

  const recoverLongPoll = async <T>(
    poll: () => Promise<T>, snapshot: () => Promise<T>
  ): Promise<T> => {
    try {
      return await poll()
    } catch (error) {
      if (!isTransientTransportError(error)) throw error

      return await snapshot()
    }
  }

  return { isTransientTransportError, recoverLongPoll }
}

export const transportHelper = createTransportHelper()
