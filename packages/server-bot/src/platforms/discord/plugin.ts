import {
  BOT_PLATFORMS, BotActionKind, BotCredentialsRejected, BotError, BotPlatform, BotTransport, type BotMessageRef,
} from '@owlmeans/bot'
import type {
  BotAuthentication, BotPlatformAction, BotPlatformActionResult, BotPlatformIdentity, BotPlatformPlugin,
  BotPlatformSession, BotReceiverEmit,
} from '../types.js'
import { makeDiscordApi } from './api.js'
import {
  DISCORD_API_BASE, DISCORD_FATAL_CLOSE_CODES, DISCORD_RECONNECT_MS, DISCORD_TEXT_MAX, DISCORD_TIMEOUT_MAX_MS,
  DISCORD_USER_AGENT,
} from './consts.js'
import { DiscordApiError, DiscordGatewayError } from './errors.js'
import { makeDiscordGateway } from './gateway.js'
import { makeDiscordMock } from './mock.js'
import { discordNormalizer } from './normalize.js'
import { discordSetupHelper } from './setup.js'
import type { DiscordBotPlatformOptions, DiscordMessage, DiscordSocket, DiscordSocketFactory, DiscordUser } from './types.js'

/**
 * The Discord plugin over the REST API v10 (https://discord.com/developers/docs/reference) and the
 * gateway: Get Current User verifies, the receiver holds a gateway connection (Discord posts no
 * message webhooks), and the channel / guild routes act. Mute is a timeout and ban a guild ban — both
 * need the guild, which a normalized update carries as `space`.
 */
export const makeDiscordBotPlatform = (opts: DiscordBotPlatformOptions = {}): BotPlatformPlugin => {
  const base = (opts.base ?? DISCORD_API_BASE).replace(/\/+$/, '')
  const userAgent = opts.userAgent ?? DISCORD_USER_AGENT
  const reconnectMs = opts.reconnectMs ?? DISCORD_RECONNECT_MS
  const mock = makeDiscordMock()
  const api = (session: BotPlatformSession) => makeDiscordApi(session, base, userAgent)

  /** The global `WebSocket` (Bun, Node ≥ 22) — its handler signatures are wider than the seam's. */
  const liveSocket: DiscordSocketFactory = url => {
    if (typeof globalThis.WebSocket !== 'function') {
      throw DiscordGatewayError.of(0, 'no-websocket')
    }

    return new globalThis.WebSocket(url) as unknown as DiscordSocket
  }

  /** A path segment: ids travel as text and are never trusted to be bare. */
  const seg = (value: string): string => encodeURIComponent(value)

  /** Clipped to the text limit without splitting a surrogate pair. */
  const clip = (text: string): string => {
    if (text.length <= DISCORD_TEXT_MAX) {
      return text
    }
    const cut = text.slice(0, DISCORD_TEXT_MAX - 1)

    return `${/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut}…`
  }

  /** A custom emoji written as `<:name:id>` / `<a:name:id>` is addressed as `name:id`; a Unicode one as itself. */
  const emojiOf = (emoji: string): string => /^<a?:([\w~]+:\d+)>$/.exec(emoji.trim())?.[1] ?? emoji.trim()

  const guildOf = (kind: BotActionKind, space?: string): string => {
    if (space == null || space === '') {
      throw new BotError(`invalid-action:no-guild:${kind}`)
    }

    return space
  }

  const refOf = (message: DiscordMessage, space?: string): BotMessageRef => ({
    chat: message.channel_id, id: message.id, ...(space != null ? { space } : {}),
  })

  const verify = async (session: BotPlatformSession): Promise<BotPlatformIdentity> => {
    if (session.transport === BotTransport.Live && (session.connection.credentials.token ?? '') === '') {
      throw new BotCredentialsRejected('missing:token')
    }
    let me: DiscordUser
    try {
      me = await api(session).call<DiscordUser>('GET', '/users/@me')
    } catch (error) {
      if (error instanceof DiscordApiError && (error.status === 401 || error.status === 403)) {
        throw new BotCredentialsRejected(`discord:${error.status}`)
      }
      throw error
    }

    return {
      id: me.id,
      ...(me.username != null && me.username !== '' ? { username: me.username } : {}),
      ...(me.global_name != null && me.global_name !== '' ? { name: me.global_name } : {}),
    }
  }

  /**
   * Discord posts no message webhooks: the hook route refuses every request, live or mock. A mock
   * connection's simulated message goes straight to `normalize` and the inbox, never through here.
   */
  const authenticate: BotPlatformPlugin['authenticate'] = (): BotAuthentication =>
    ({ result: 'reject', reason: 'gateway-only' })

  /**
   * What no reconnect fixes: a close code of `DISCORD_FATAL_CLOSE_CODES` (4004 a wrong token, 4014
   * the MESSAGE CONTENT intent off …), or a REST 401 (Get Gateway Bot with a revoked token).
   */
  const fatal = (error: unknown): boolean =>
    (error instanceof DiscordGatewayError && DISCORD_FATAL_CLOSE_CODES[error.code] != null)
    || (error instanceof DiscordApiError && error.status === 401)

  /** The gateway until aborted — over the global `WebSocket` live, over the in-process fake mock. */
  const receiver = async (session: BotPlatformSession, emit: BotReceiverEmit, signal: AbortSignal): Promise<void> => {
    await makeDiscordGateway({
      connection: session.connection.id,
      token: session.connection.credentials.token ?? '',
      api: api(session),
      socket: session.transport === BotTransport.Mock ? mock.socket(session.connection) : opts.socket ?? liveSocket,
      emit,
      signal,
      reconnectMs,
    }).run()
  }

  const act = async (session: BotPlatformSession, action: BotPlatformAction): Promise<BotPlatformActionResult> => {
    const client = api(session)
    switch (action.kind) {
      case BotActionKind.Reply: {
        const sent = await client.call<DiscordMessage>('POST', `/channels/${seg(action.to.chat)}/messages`, {
          content: clip(action.text),
          message_reference: {
            type: 0,
            message_id: action.to.id,
            channel_id: action.to.chat,
            ...(action.to.space != null ? { guild_id: action.to.space } : {}),
            fail_if_not_exists: false,
          },
          // A reply pings the member it answers; never @everyone or a role.
          allowed_mentions: { parse: ['users'], replied_user: true },
        })
        return { message: refOf(sent, action.to.space) }
      }
      case BotActionKind.Send: {
        const sent = await client.call<DiscordMessage>('POST', `/channels/${seg(action.chat.id)}/messages`, {
          content: clip(action.text),
          allowed_mentions: { parse: ['users'] },
        })
        return { message: refOf(sent, action.chat.space) }
      }
      case BotActionKind.Delete:
        await client.call<void>('DELETE', `/channels/${seg(action.message.chat)}/messages/${seg(action.message.id)}`)
        return {}
      case BotActionKind.Mute: {
        const guild = guildOf(action.kind, action.space)
        const until = Math.min(action.until.getTime(), Date.now() + DISCORD_TIMEOUT_MAX_MS)
        await client.call<unknown>('PATCH', `/guilds/${seg(guild)}/members/${seg(action.user)}`, {
          communication_disabled_until: new Date(until).toISOString(),
        })
        return {}
      }
      case BotActionKind.Ban: {
        const guild = guildOf(action.kind, action.space)
        await client.call<void>('PUT', `/guilds/${seg(guild)}/bans/${seg(action.user)}`, {})
        return {}
      }
      case BotActionKind.React:
        await client.call<void>(
          'PUT',
          `/channels/${seg(action.message.chat)}/messages/${seg(action.message.id)}/reactions/${seg(emojiOf(action.emoji))}/@me`
        )
        return {}
    }
  }

  return {
    platform: BotPlatform.Discord,
    descriptor: BOT_PLATFORMS[BotPlatform.Discord],
    verify,
    setup: connection => discordSetupHelper.steps(connection),
    authenticate,
    normalize: discordNormalizer.normalize,
    receiver,
    fatal,
    act,
    mock,
  }
}

/** The built-in instance (`https://discord.com/api/v10`) — its `mock` is the one simulated connections use. */
export const discordBotPlatform = makeDiscordBotPlatform()
