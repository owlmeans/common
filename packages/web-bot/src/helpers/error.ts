import {
  BotConnectionNotFound, BotCredentialsRejected, BotError, BotErrorPlatform, BotSignatureRejected, BotTransportMismatch,
  BotUnsupportedAction,
} from '@owlmeans/bot'
import type { BotErrorKey } from '../types.js'
import {
  BOT_ERROR_INLINE_DETAIL, BOT_ERROR_MARKER, BOT_ERROR_MARKERS, BOT_ERROR_PLATFORM_MARKER, BOT_ERROR_TYPE_PREFIX,
  BOT_ERROR_TYPES,
} from './error/consts.local.js'
import type { BotErrorHelper } from './error/types.js'

export const createBotErrorHelper = (): BotErrorHelper => {
  /**
   * Whether a marker (`<id>`, `<id>-gateway`) or a lower-cased type-name tail (`<id>`,
   * `<id>gateway`) names a registered platform — how a refusal stored before the one
   * platform marker existed is still read as the platform's own. No list of platform names: the ids
   * are the server's.
   */
  const namesPlatform = (marker: string, platforms: readonly string[], joined: boolean = false): boolean =>
    platforms.some(id => id !== '' && (marker === id || marker.startsWith(joined ? id : `${id}-`)))

  const classKeyOf = (error: Error, platforms: readonly string[]): BotErrorKey | null => {
    const byClass: BotErrorKey | null = error instanceof BotConnectionNotFound ? 'connection-not-found'
      : error instanceof BotCredentialsRejected ? 'credentials-rejected'
        : error instanceof BotSignatureRejected ? 'signature-rejected'
          : error instanceof BotTransportMismatch ? 'transport-mismatch'
            : error instanceof BotUnsupportedAction ? 'unsupported-action'
              : error instanceof BotErrorPlatform ? 'platform-refused'
                : null
    if (byClass != null) return byClass
    // A server-bot class arrives as a ResilientError that keeps only its type name.
    const type = (error as Error & { type?: unknown }).type
    if (typeof type !== 'string') return null
    const mirrored = BOT_ERROR_TYPES[type]
    if (mirrored != null) return mirrored
    const tail = type.startsWith(BOT_ERROR_TYPE_PREFIX) ? type.slice(BOT_ERROR_TYPE_PREFIX.length).toLowerCase() : ''

    return tail !== '' && namesPlatform(tail, platforms.map(id => id.replace(/-/g, '')), true) ? 'platform-refused' : null
  }

  const messageOf = (error: Error | string): string => typeof error === 'string' ? error : error.message

  const keyOf: BotErrorHelper['keyOf'] = (error, platforms = []) => {
    if (error == null) return 'generic'
    if (typeof error !== 'string') {
      const byClass = classKeyOf(error, platforms)
      if (byClass != null) return byClass
    }
    const marked = BOT_ERROR_MARKER.exec(messageOf(error).trim())
    if (marked != null) {
      return BOT_ERROR_MARKERS[marked[1]] ?? (namesPlatform(marked[1], platforms) ? 'platform-refused' : 'bot')
    }

    return typeof error !== 'string' && error instanceof BotError ? 'bot' : 'generic'
  }

  const detailOf: BotErrorHelper['detailOf'] = error => {
    if (error == null) return null
    const text = messageOf(error).trim()
    const marked = BOT_ERROR_MARKER.exec(text)
    if (marked != null) {
      // The one platform marker names its platform first: the detail is what the platform said.
      const raw = marked[1] === BOT_ERROR_PLATFORM_MARKER ? (marked[2] ?? '').replace(/^[^:]*:?/, '') : marked[2] ?? ''
      const detail = raw.trim()
      // A class's default message is the word `error` — nothing a person learns from.
      return detail === '' || detail === 'error' ? null : detail
    }

    return typeof error === 'string' && text !== '' ? text : null
  }

  const inlinesDetail = (key: BotErrorKey): boolean => BOT_ERROR_INLINE_DETAIL.includes(key)

  return { keyOf, detailOf, inlinesDetail }
}

export const botErrorHelper = createBotErrorHelper()
