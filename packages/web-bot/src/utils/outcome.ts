import { ResilientError } from '@owlmeans/error'
import { logger } from '@owlmeans/log'
import type { BotOutcome } from '../types.js'
import type { BotOutcomeUtils } from './outcome/types.js'

export const createBotOutcomeUtils = (): BotOutcomeUtils => {
  const log = logger('web-bot')

  const run = async <T>(call: () => Promise<T>): Promise<BotOutcome<T>> => {
    try {
      return { ok: true, value: await call() }
    } catch (e) {
      const error = ResilientError.ensure(e instanceof Error ? e : String(e))
      log.debug('Bot call failed', error)

      return { ok: false, error }
    }
  }

  return { run }
}

export const botOutcomeUtils = createBotOutcomeUtils()
