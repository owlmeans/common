import type { BotHookRequest } from '../../types.js'

/** Reading a hook request the same way in every plugin. */
export interface BotHookHelper {
  /** A header's first value, by case-insensitive name. */
  header: (request: BotHookRequest, name: string) => string | undefined
  /** The signed bytes as UTF-8 text — `rawBody`, else the body re-serialized (only an unsigned check may rely on that). */
  rawText: (request: BotHookRequest) => string
  /** The JSON payload — `body`, else `rawBody` parsed; `null` when there is none or it does not parse. */
  json: (request: BotHookRequest) => unknown
  /** A timing-safe comparison of two secrets; an empty expected secret never matches. */
  sameSecret: (presented: string | undefined, expected: string | undefined) => boolean
}
