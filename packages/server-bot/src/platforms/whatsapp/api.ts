import { WHATSAPP_CALL_TIMEOUT_MS } from './consts.js'
import { WhatsAppApiError } from './errors.js'
import type { WhatsAppApi, WhatsAppApiFactory, WhatsAppCallOptions, WhatsAppErrorEnvelope } from './types.js'
import { signalUtils } from '../../utils/signal.js'

/**
 * The Graph API over a session: `<root>/<path>`, the access token as `Authorization: Bearer`, JSON in
 * and out; a refusal is `{ error: { message, code, … } }`. The token never reaches an error message.
 */
export const makeWhatsAppApi: WhatsAppApiFactory = (session, root): WhatsAppApi => {
  const call = async <T>(
    method: 'GET' | 'POST', path: string, query: Record<string, string> | undefined,
    body: Record<string, unknown> | undefined, opts: WhatsAppCallOptions
  ): Promise<T> => {
    const token = session.connection.credentials.accessToken ?? ''
    const search = query != null && Object.keys(query).length > 0 ? `?${new URLSearchParams(query).toString()}` : ''
    const name = `${method} ${path.split('/').pop() ?? ''}`
    let response: Response
    try {
      response = await session.fetch(`${root}/${path}${search}`, {
        method,
        headers: {
          ...(token !== '' ? { authorization: `Bearer ${token}` } : {}),
          ...(body != null ? { 'content-type': 'application/json' } : {}),
        },
        ...(body != null ? { body: JSON.stringify(body) } : {}),
        signal: signalUtils.deadline(opts.timeoutMs ?? WHATSAPP_CALL_TIMEOUT_MS, opts.signal),
      })
    } catch (error) {
      if (opts.signal?.aborted === true) {
        throw error
      }
      // A transport error may carry the request — and its header the token: never pass it on.
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      throw WhatsAppApiError.of(timedOut ? 504 : 503, `${name}: ${timedOut ? 'timeout' : 'unreachable'}`)
    }
    let answer: unknown
    try {
      answer = await response.json()
    } catch {
      throw WhatsAppApiError.of(response.status, `${name}: unreadable answer`)
    }
    const refusal = (answer as Partial<WhatsAppErrorEnvelope> | null)?.error
    if (refusal != null || !response.ok) {
      throw WhatsAppApiError.of(
        typeof refusal?.code === 'number' ? refusal.code : response.status,
        refusal?.message ?? `${name}: refused`,
        response.status
      )
    }

    return answer as T
  }

  const get = async <T>(path: string, query?: Record<string, string>, opts: WhatsAppCallOptions = {}): Promise<T> =>
    await call<T>('GET', path, query, undefined, opts)

  const post = async <T>(path: string, body: Record<string, unknown>, opts: WhatsAppCallOptions = {}): Promise<T> =>
    await call<T>('POST', path, undefined, body, opts)

  return { get, post }
}
