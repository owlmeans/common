import {
  DISCORD_CALL_TIMEOUT_MS, DISCORD_RATE_LIMIT_RETRIES, DISCORD_RATE_LIMIT_WAIT_MAX_MS, DISCORD_USER_AGENT,
} from './consts.js'
import { DiscordApiError } from './errors.js'
import type { DiscordApi, DiscordApiFactory, DiscordCallOptions, DiscordErrorBody } from './types.js'
import { signalUtils } from '../../utils/signal.js'

/** The answer's JSON, or `null` when it has none or it does not parse. */
const jsonOf = async (response: Response): Promise<unknown> => {
  try {
    const text = await response.text()
    return text.trim() === '' ? null : JSON.parse(text)
  } catch {
    return null
  }
}

/** Seconds a 429 asks to wait: the body's precise `retry_after`, else the `Retry-After` header, else 1. */
const retryAfterOf = (response: Response, body: DiscordErrorBody | null): number => {
  if (typeof body?.retry_after === 'number' && Number.isFinite(body.retry_after)) {
    return Math.max(body.retry_after, 0)
  }
  const header = Number(response.headers.get('retry-after'))

  return Number.isFinite(header) && header >= 0 ? header : 1
}

/**
 * The REST API over a session: `Authorization: Bot <token>` (a header — never in a URL), JSON in and
 * out, a 204 as `undefined`. A rate limit (429) is waited out and retried at most
 * `DISCORD_RATE_LIMIT_RETRIES` times while each wait is ≤ `DISCORD_RATE_LIMIT_WAIT_MAX_MS`; past that
 * it is a `DiscordApiError` 429 carrying `retryAfter`.
 */
export const makeDiscordApi: DiscordApiFactory = (session, base, userAgent = DISCORD_USER_AGENT): DiscordApi => {
  const call = async <T>(method: string, path: string, body?: unknown, opts: DiscordCallOptions = {}): Promise<T> => {
    const token = session.connection.credentials.token ?? ''
    for (let attempt = 0; ; attempt++) {
      let response: Response
      try {
        response = await session.fetch(`${base}${path}`, {
          method,
          headers: {
            authorization: `Bot ${token}`,
            'user-agent': userAgent,
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: signalUtils.deadline(opts.timeoutMs ?? DISCORD_CALL_TIMEOUT_MS, opts.signal),
        })
      } catch (error) {
        if (opts.signal?.aborted === true) {
          throw error
        }
        // A transport error is rethrown without its details — the request held the token.
        const timeout = error instanceof Error && error.name === 'TimeoutError'
        throw DiscordApiError.of(timeout ? 504 : 503, `${method}: ${timeout ? 'timeout' : 'unreachable'}`)
      }
      if (response.status === 204) {
        return undefined as T
      }
      const answer = await jsonOf(response)
      if (response.ok) {
        if (answer == null) {
          throw DiscordApiError.of(response.status, 'unreadable answer')
        }
        return answer as T
      }
      const refusal = answer != null && typeof answer === 'object' ? answer as DiscordErrorBody : null
      if (response.status === 429) {
        const retryAfter = retryAfterOf(response, refusal)
        if (attempt < DISCORD_RATE_LIMIT_RETRIES && retryAfter * 1000 <= DISCORD_RATE_LIMIT_WAIT_MAX_MS) {
          await signalUtils.pause(Math.ceil(retryAfter * 1000), opts.signal)
          continue
        }
        throw DiscordApiError.of(429, refusal?.message ?? 'rate limited', refusal?.code ?? 0, retryAfter)
      }

      throw DiscordApiError.of(response.status, refusal?.message ?? 'refused', refusal?.code ?? 0)
    }
  }

  return { call }
}
