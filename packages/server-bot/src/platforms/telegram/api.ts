import { TELEGRAM_CALL_TIMEOUT_MS } from './consts.js'
import { TelegramApiError } from './errors.js'
import type { TelegramApi, TelegramApiFactory, TelegramCallOptions, TelegramEnvelope } from './types.js'
import { signalUtils } from '../../utils/signal.js'

/**
 * The Bot API over a session: `POST <base>/bot<token>/<method>`, JSON in, the `{ ok, result }`
 * envelope out. The URL carries the token — it is never logged.
 */
export const makeTelegramApi: TelegramApiFactory = (session, base): TelegramApi => {
  const call = async <T>(
    method: string, params: Record<string, unknown> = {}, opts: TelegramCallOptions = {}
  ): Promise<T> => {
    const token = session.connection.credentials.token ?? ''
    let response: Response
    try {
      response = await session.fetch(`${base}/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
        signal: signalUtils.deadline(opts.timeoutMs ?? TELEGRAM_CALL_TIMEOUT_MS, opts.signal),
      })
    } catch (error) {
      if (opts.signal?.aborted === true) {
        throw error
      }
      // A transport error may name the URL — and the URL carries the token: never pass it on.
      const name = error instanceof Error ? error.name : 'Error'
      throw TelegramApiError.of(name === 'TimeoutError' ? 504 : 503, `${method}: ${name === 'TimeoutError' ? 'timeout' : 'unreachable'}`)
    }
    let envelope: TelegramEnvelope<T>
    try {
      envelope = await response.json() as TelegramEnvelope<T>
    } catch {
      throw TelegramApiError.of(response.status, 'unreadable answer')
    }
    if (envelope?.ok !== true) {
      throw TelegramApiError.of(
        envelope?.error_code ?? response.status, envelope?.description ?? 'refused', envelope?.parameters?.retry_after
      )
    }

    return envelope.result as T
  }

  return { call }
}
