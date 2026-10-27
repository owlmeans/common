import type { BotPlatform } from '@owlmeans/bot'

export interface BotOriginHelper {
  /**
   * The public origin a request was addressed to — `x-forwarded-proto` + `x-forwarded-host`, else
   * the `host` header; the first value of a forwarded list; `http` when no protocol was forwarded.
   * `undefined` when no usable host is present.
   */
  originOf: (headers: Record<string, string | string[] | undefined>) => string | undefined
  /** Whether a URL is HTTPS on a public host — not localhost, a private address or a single label. */
  isPublicHttps: (url: string) => boolean
  /** The default hook URL: `${origin}/api/bot/hook/${platform}/${connection}`. */
  hookUrl: (origin: string, platform: BotPlatform, connection: string) => string
}
