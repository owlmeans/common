import type { BotPlatform, BotSimulateInput } from '@owlmeans/bot'
import type { BotMockCall, BotNativeInbound, BotPlatformIdentity, BotPlatformPlugin } from '../platforms/types.js'

/**
 * What signs a mock inbound request: a connection as the server stores it (its `id` and
 * `hookSecret`), or the credentials the platform signs with (WhatsApp `appSecret`, Slack
 * `signingSecret`) — whichever the platform uses.
 */
export interface BotMockSigning {
  /** The connection id — the mock's per-connection state (ids, sent messages) keys on it. Default `mock`. */
  id?: string
  hookSecret?: string | null
  credentials?: Record<string, string>
  /** The bot as verification answered — mentions and replies to it are recognized. */
  identity?: BotPlatformIdentity | null
  label?: string
}

/** Native, signed inbound payloads for tests and end-to-end diagnostics — no network. */
export interface BotMockHelper {
  /** The platform's NATIVE payload for `input`, signed like the platform signs it: `{ body, rawBody, headers }`. */
  inbound: (platform: BotPlatform, input: BotSimulateInput, signing: BotMockSigning) => BotNativeInbound
  /** Queue `input` (as the native payload) for the connection's mock receiver (poll / gateway). */
  feed: (platform: BotPlatform, signing: BotMockSigning, input: BotSimulateInput) => void
  /** The calls a connection's mock API answered. */
  calls: (platform: BotPlatform, connection: string) => BotMockCall[]
  /** @throws {BotUnsupportedAction} a platform with no plugin */
  plugin: (platform: BotPlatform) => BotPlatformPlugin
}
