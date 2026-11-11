import type { BotPlatformId } from '@owlmeans/bot'
import type { BotErrorKey } from '../../types.js'

/**
 * How a bot failure is explained. `@owlmeans/bot` and `@owlmeans/server-bot` ship no copy; the
 * sentence for each of their refusals lives in this package, under `lib : bot.errors.<key>`.
 */
export interface BotErrorHelper {
  /**
   * The copy key for a failure: the class of a registered `@owlmeans/bot` error first
   * (`BotErrorPlatform` → `platform-refused`), then the type name a `@owlmeans/server-bot` error keeps
   * across the wire (`BotErrorConnectionDisabled` …), then the marker its message carries
   * (`bot:credentials-rejected:…` survives a hop where the class is unknown; a `receiver:` / `hook:`
   * prefix is read past), then `bot` for any other `bot:` message and `generic` for everything else.
   * A plain string — a connection's `lastError`, an activity's `code` — is read by its marker the
   * same way.
   *
   * `platforms` are the server's registered platform ids: a refusal stored before the one platform
   * marker existed — `bot:<id>:…`, `bot:<id>-<part>:…`, or a type name `BotError<Id>…` — reads as
   * `platform-refused` when it starts with one of them.
   */
  keyOf: (error: Error | string | null | undefined, platforms?: readonly BotPlatformId[]) => BotErrorKey
  /**
   * What the failure said beyond its class — the detail after a `bot:<marker>:` prefix (after
   * `bot:platform:<id>:` for a platform's refusal), or a plain string as it is — or null when there is
   * nothing worth showing beside the translated sentence. An `Error` that is not a bot refusal answers
   * null: transport wording is not for the person.
   */
  detailOf: (error: Error | string | null | undefined) => string | null
  /**
   * Whether the key's sentence carries the detail itself (`{{detail}}`, "The platform refused: …")
   * rather than showing it under the sentence.
   */
  inlinesDetail: (key: BotErrorKey) => boolean
}
