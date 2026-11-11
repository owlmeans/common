import { BotErrorPlatform } from '@owlmeans/bot'
import { botSignalHelper } from '../../helpers/signal.js'
import type { BotPlatformSession } from '../../platforms/types.js'
import { BOT_TEST_CALL_TIMEOUT_MS } from './consts.js'
import type { BotTestAnswer, BotTestApi, BotTestCallOptions } from './types.js'

/**
 * The test platform's API over one session: `POST <base>/<method>`, JSON params, the bearer token
 * of the credential the call authorizes with; `{ ok: true, result }` or `{ ok: false, error }` back.
 */
export const makeBotTestApi = (session: BotPlatformSession, base: string, platform: string): BotTestApi => {
  const tokenOf = (credential?: string): string => {
    const credentials = session.connection.credentials
    if (credential != null) {
      return credentials[credential] ?? ''
    }

    return Object.values(credentials).find(value => value !== '') ?? ''
  }

  const call: BotTestApi['call'] = async <T>(
    method: string, params: Record<string, unknown> = {}, opts: BotTestCallOptions = {}
  ): Promise<T> => {
    const token = tokenOf(opts.credential)
    let response: Response
    try {
      response = await session.fetch(`${base}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token !== '' ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(params),
        signal: botSignalHelper.deadline(opts.timeoutMs ?? BOT_TEST_CALL_TIMEOUT_MS, opts.signal),
      })
    } catch (error) {
      if (opts.signal?.aborted === true) {
        throw error
      }
      const timeout = error instanceof Error && error.name === 'TimeoutError'
      throw BotErrorPlatform.of(platform, `${timeout ? 504 : 503}:${method}: ${timeout ? 'timeout' : 'unreachable'}`)
    }
    let answer: BotTestAnswer
    try {
      answer = await response.json() as BotTestAnswer
    } catch {
      throw BotErrorPlatform.of(platform, `${response.status}:unreadable answer`)
    }
    if (answer?.ok !== true) {
      throw BotErrorPlatform.of(platform, `${response.ok ? 400 : response.status}:${answer?.error ?? 'refused'}`)
    }

    return answer.result as T
  }

  return { call }
}
