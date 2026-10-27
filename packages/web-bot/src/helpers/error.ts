import {
  BotConnectionNotFound, BotCredentialsRejected, BotError, BotSignatureRejected, BotTransportMismatch,
  BotUnsupportedAction,
} from '@owlmeans/bot'
import type { BotErrorKey } from '../types.js'
import { BOT_ERROR_INLINE_DETAIL, BOT_ERROR_MARKER, BOT_ERROR_MARKERS, BOT_ERROR_TYPES } from './error/consts.local.js'
import type { BotErrorHelper } from './error/types.js'

export const createBotErrorHelper = (): BotErrorHelper => {
  const classKeyOf = (error: Error): BotErrorKey | null => {
    const byClass: BotErrorKey | null = error instanceof BotConnectionNotFound ? 'connection-not-found'
      : error instanceof BotCredentialsRejected ? 'credentials-rejected'
        : error instanceof BotSignatureRejected ? 'signature-rejected'
          : error instanceof BotTransportMismatch ? 'transport-mismatch'
            : error instanceof BotUnsupportedAction ? 'unsupported-action'
              : null
    if (byClass != null) return byClass
    // A server-bot class arrives as a ResilientError that keeps only its type name.
    const type = (error as Error & { type?: unknown }).type

    return typeof type === 'string' ? BOT_ERROR_TYPES[type] ?? null : null
  }

  const messageOf = (error: Error | string): string => typeof error === 'string' ? error : error.message

  const keyOf = (error: Error | string | null | undefined): BotErrorKey => {
    if (error == null) return 'generic'
    if (typeof error !== 'string') {
      const byClass = classKeyOf(error)
      if (byClass != null) return byClass
    }
    const marked = BOT_ERROR_MARKER.exec(messageOf(error).trim())
    if (marked != null) return BOT_ERROR_MARKERS[marked[1]] ?? 'bot'

    return typeof error !== 'string' && error instanceof BotError ? 'bot' : 'generic'
  }

  const detailOf = (error: Error | string | null | undefined): string | null => {
    if (error == null) return null
    const text = messageOf(error).trim()
    const marked = BOT_ERROR_MARKER.exec(text)
    if (marked != null) {
      const detail = (marked[2] ?? '').trim()
      // A class's default message is the word `error` — nothing a person learns from.
      return detail === '' || detail === 'error' ? null : detail
    }

    return typeof error === 'string' && text !== '' ? text : null
  }

  const inlinesDetail = (key: BotErrorKey): boolean => BOT_ERROR_INLINE_DETAIL.includes(key)

  return { keyOf, detailOf, inlinesDetail }
}

export const botErrorHelper = createBotErrorHelper()
