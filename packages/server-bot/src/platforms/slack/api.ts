import { SLACK_CALL_TIMEOUT_MS, SLACK_RATE_LIMIT_DEFAULT_WAIT_S } from './consts.js'
import { SlackApiError } from './errors.js'
import type { SlackAnswer, SlackApi, SlackApiFactory, SlackCallOptions } from './types.js'
import { signalUtils } from '../../utils/signal.js'

/** `Retry-After` in seconds (an HTTP date counts from now); the default when absent or unreadable. */
const retryAfterOf = (response: Response): number => {
  const value = response.headers.get('retry-after')
  if (value == null || value.trim() === '') {
    return SLACK_RATE_LIMIT_DEFAULT_WAIT_S
  }
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds)
  }
  const at = Date.parse(value)

  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - Date.now()) / 1000)) : SLACK_RATE_LIMIT_DEFAULT_WAIT_S
}

/**
 * The Web API over a session: `POST <base>/<method>`, JSON in, `Authorization: Bearer <token>`, the
 * `{ ok, error? }` answer out. Tokens travel in a header — never in a URL, never in an error.
 */
export const makeSlackApi: SlackApiFactory = (session, base, retry): SlackApi => {
  const call = async <T extends SlackAnswer>(
    method: string, params: Record<string, unknown> = {}, opts: SlackCallOptions = {}
  ): Promise<T> => {
    const token = opts.token ?? session.connection.credentials.botToken ?? ''
    for (let attempt = 0; ; attempt++) {
      let response: Response
      try {
        response = await session.fetch(`${base}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${token}` },
          body: JSON.stringify(params),
          signal: signalUtils.deadline(opts.timeoutMs ?? SLACK_CALL_TIMEOUT_MS, opts.signal),
        })
      } catch (error) {
        if (opts.signal?.aborted === true) {
          throw error
        }
        // Only the error's kind is passed on: a transport message is not ours to repeat.
        const name = error instanceof Error ? error.name : 'Error'
        throw SlackApiError.of(method, name === 'TimeoutError' ? 'timeout' : 'unreachable')
      }
      if (response.status === 429) {
        const wait = retryAfterOf(response)
        if (attempt < retry.retries && wait <= retry.maxRetryWaitS) {
          await signalUtils.pause(wait * 1000, opts.signal)
          continue
        }
        throw SlackApiError.of(method, 'ratelimited', wait)
      }
      let answer: T
      try {
        answer = await response.json() as T
      } catch {
        throw SlackApiError.of(method, `http_${response.status}`)
      }
      if (answer?.ok !== true) {
        throw SlackApiError.of(method, typeof answer?.error === 'string' && answer.error !== '' ? answer.error : `http_${response.status}`)
      }

      return answer
    }
  }

  return { call }
}
