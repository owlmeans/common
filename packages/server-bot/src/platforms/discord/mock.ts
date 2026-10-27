import { createHash, randomInt, randomUUID } from 'node:crypto'
import { BotChatKind, type BotSimulateInput } from '@owlmeans/bot'
import type { BotFetch, BotFetchInit, BotMockCall, BotNativeInbound, BotPlatformConnection } from '../types.js'
import {
  DISCORD_EPOCH, DISCORD_MESSAGE_DEFAULT, DISCORD_MESSAGE_REPLY, DISCORD_MOCK_CHANNEL_ID, DISCORD_MOCK_GATEWAY_URL,
  DISCORD_MOCK_GUILD_ID, DISCORD_MOCK_HEARTBEAT_MS, DISCORD_MOCK_OTHER_ID, DISCORD_MOCK_RESUME_URL,
  DISCORD_MOCK_SENDER_ID, DISCORD_MOCK_SENDER_NAME, DISCORD_MOCK_SENDER_USERNAME,
  DISCORD_SNOWFLAKE_LOW_BITS, DISCORD_SOCKET_CLOSED, DISCORD_SOCKET_CLOSING, DISCORD_SOCKET_CONNECTING, DISCORD_SOCKET_OPEN,
  DISCORD_TEXT_MAX, DISCORD_TIMEOUT_MAX_MS, DiscordGatewayOp,
} from './consts.js'
import type {
  DiscordErrorBody, DiscordGatewayPayload, DiscordMessage, DiscordMock, DiscordMockSocket, DiscordMockState,
  DiscordSocket, DiscordSocketFactory, DiscordUser,
} from './types.js'

/**
 * Discord, faked per connection and in process: the REST routes the plugin calls answer with the
 * API's own shapes (a fake bot user, messages with fresh snowflake ids, 204s for the moderation
 * calls, `{ code, message }` refusals), and the gateway is an in-process socket — Hello, READY on
 * Identify, RESUMED on Resume, heartbeat acks, and every dispatch `feed` queues. No network.
 */
export const makeDiscordMock = (): DiscordMock => {
  const states = new Map<string, DiscordMockState>()

  const stateOf = (connection: string): DiscordMockState => {
    let state = states.get(connection)
    if (state == null) {
      state = { lastId: 0n, sequence: 0, queue: [], calls: [], sent: new Set(), sockets: new Set() }
      states.set(connection, state)
    }

    return state
  }

  /** A stable non-negative integer below `modulo`, derived from a text. */
  const hashOf = (text: string, modulo: number): number =>
    Number.parseInt(createHash('sha256').update(text).digest('hex').slice(0, 12), 16) % modulo

  /** A snowflake from a simulated id: a snowflake stays itself, any other text maps to a stable one. */
  const snowflakeOf = (value: string | undefined, fallback: string): string => {
    if (value == null || value === '') {
      return fallback
    }

    return /^\d{1,20}$/.test(value) ? value : `${1_000_000_000_000_000_000n + BigInt(hashOf(value, 1_000_000_000_000_000))}`
  }

  /**
   * A fresh snowflake of now with random low bits (where Discord puts its worker, process and
   * increment) — always above the previous one; a restarted or another process practically never meets it.
   */
  const nextId = (state: DiscordMockState): string => {
    const low = BigInt(DISCORD_SNOWFLAKE_LOW_BITS)
    const clock = (BigInt(Date.now() - DISCORD_EPOCH) << low) | BigInt(randomInt(2 ** DISCORD_SNOWFLAKE_LOW_BITS))
    state.lastId = clock > state.lastId ? clock : state.lastId + 1n

    return `${state.lastId}`
  }

  const usernameOf = (connection: string): string =>
    `mock_${connection.replace(/[^A-Za-z0-9]/g, '').slice(0, 24).toLowerCase() || 'bot'}_bot`

  const userIdOf: DiscordMock['userIdOf'] = connection => {
    const applicationId = connection.credentials?.applicationId ?? ''

    return /^\d{17,20}$/.test(applicationId) ? applicationId : snowflakeOf(`bot:${connection.id}`, DISCORD_MOCK_OTHER_ID)
  }

  const botUserOf = (connection: BotPlatformConnection): DiscordUser => ({
    id: connection.identity?.id ?? userIdOf(connection),
    username: connection.identity?.username ?? usernameOf(connection.id),
    global_name: connection.label !== '' ? connection.label : 'Mock bot',
    discriminator: '0',
    avatar: null,
    bot: true,
  })

  const memberUserOf = (id: string): DiscordUser => ({
    id, username: `member_${id.slice(-6)}`, global_name: null, discriminator: '0', avatar: null,
  })

  const answer = (status: number, body?: unknown): Response => status === 204
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const refuse = (status: number, refusal: DiscordErrorBody): Response => answer(status, refusal)

  const invalidForm = (field: string, message: string): Response => refuse(400, {
    code: 50035, message: 'Invalid Form Body', errors: { [field]: { _errors: [{ code: 'BASE_TYPE_INVALID', message }] } },
  })

  const aborted = (): Error => {
    const error = new Error('The operation was aborted.')
    error.name = 'AbortError'
    return error
  }

  /** The routes the plugin calls: method, the Discord docs' endpoint name, path pattern, path parameters. */
  const routes: [string, string, RegExp, string[]][] = [
    ['GET', 'getCurrentUser', /\/users\/@me$/, []],
    ['GET', 'getGatewayBot', /\/gateway\/bot$/, []],
    ['POST', 'createMessage', /\/channels\/([^/]+)\/messages$/, ['channel_id']],
    ['DELETE', 'deleteMessage', /\/channels\/([^/]+)\/messages\/([^/]+)$/, ['channel_id', 'message_id']],
    ['PUT', 'createReaction', /\/channels\/([^/]+)\/messages\/([^/]+)\/reactions\/([^/]+)\/@me$/, ['channel_id', 'message_id', 'emoji']],
    ['PATCH', 'modifyGuildMember', /\/guilds\/([^/]+)\/members\/([^/]+)$/, ['guild_id', 'user_id']],
    ['PUT', 'createGuildBan', /\/guilds\/([^/]+)\/bans\/([^/]+)$/, ['guild_id', 'user_id']],
  ]

  /** The route a request names — its endpoint name and path parameters, else 404 / 405. */
  const routeOf = (verb: string, path: string): { name: string, params: Record<string, string> } | number => {
    let known = false
    for (const [method, name, pattern, keys] of routes) {
      const found = pattern.exec(path)
      if (found == null) {
        continue
      }
      known = true
      if (method === verb) {
        return { name, params: Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(found[index + 1])])) }
      }
    }

    return known ? 405 : 404
  }

  const createMessage = (
    connection: BotPlatformConnection, state: DiscordMockState, params: Record<string, unknown>
  ): Response => {
    const content = typeof params.content === 'string' ? params.content : ''
    if (content.trim() === '') {
      return refuse(400, { code: 50006, message: 'Cannot send an empty message' })
    }
    if (content.length > DISCORD_TEXT_MAX) {
      return invalidForm('content', `Must be ${DISCORD_TEXT_MAX} or fewer in length.`)
    }
    const reference = params.message_reference as DiscordMessage['message_reference'] | undefined
    const id = nextId(state)
    state.sent.add(id)
    const channel = `${params.channel_id}`
    const message: DiscordMessage = {
      id,
      channel_id: channel,
      author: botUserOf(connection),
      content,
      timestamp: new Date().toISOString(),
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: reference?.message_id != null ? DISCORD_MESSAGE_REPLY : DISCORD_MESSAGE_DEFAULT,
      ...(reference?.message_id != null
        ? {
          message_reference: {
            type: 0, channel_id: reference.channel_id ?? channel, message_id: reference.message_id,
            ...(reference.guild_id != null ? { guild_id: reference.guild_id } : {}),
          },
        }
        : {}),
    }

    return answer(200, message)
  }

  const modifyGuildMember = (params: Record<string, unknown>): Response => {
    const until = params.communication_disabled_until
    if (until != null) {
      const time = typeof until === 'string' ? Date.parse(until) : Number.NaN
      if (!Number.isFinite(time) || time > Date.now() + DISCORD_TIMEOUT_MAX_MS + 60_000) {
        return invalidForm('communication_disabled_until', 'Timeout must be at most 28 days in the future.')
      }
    }

    return answer(200, {
      user: memberUserOf(`${params.user_id}`),
      nick: null,
      roles: [],
      joined_at: new Date(Date.now() - 86_400_000).toISOString(),
      deaf: false,
      mute: false,
      flags: 0,
      communication_disabled_until: until ?? null,
    })
  }

  const fetch = (connection: BotPlatformConnection): BotFetch => async (url: string, init?: BotFetchInit) => {
    if (init?.signal?.aborted === true) {
      throw aborted()
    }
    const verb = (init?.method ?? 'GET').toUpperCase()
    const route = routeOf(verb, new URL(url).pathname)
    if (typeof route === 'number') {
      return refuse(route, { code: 0, message: route === 404 ? '404: Not Found' : '405: Method Not Allowed' })
    }
    let body: Record<string, unknown> = {}
    try {
      body = init?.body != null && init.body !== '' ? JSON.parse(init.body) as Record<string, unknown> : {}
    } catch {
      return refuse(400, { code: 50109, message: 'The request body contains invalid JSON.' })
    }
    const params = { ...route.params, ...body }
    const state = stateOf(connection.id)
    state.calls.push({ method: route.name, params, at: new Date().toISOString() })

    switch (route.name) {
      case 'getCurrentUser':
        return answer(200, botUserOf(connection))
      case 'getGatewayBot':
        return answer(200, {
          url: DISCORD_MOCK_GATEWAY_URL,
          shards: 1,
          session_start_limit: { total: 1000, remaining: 999, reset_after: 14_400_000, max_concurrency: 1 },
        })
      case 'createMessage':
        return createMessage(connection, state, params)
      case 'createReaction':
        return route.params.emoji.trim() === '' ? refuse(400, { code: 10014, message: 'Unknown Emoji' }) : answer(204)
      case 'modifyGuildMember':
        return modifyGuildMember(params)
      default:
        // deleteMessage, createGuildBan
        return answer(204)
    }
  }

  /** The bot's username typed as `@name` becomes `<@id>`, as the Discord client sends a mention. */
  const contentOf = (text: string, bot: DiscordUser): string => {
    const name = bot.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return text.replace(new RegExp(`(?<![\\w@])@${name}(?!\\w)`, 'gi'), `<@${bot.id}>`)
  }

  /** The users a content mentions (`<@id>`, `<@!id>`), the bot as itself. */
  const mentionsOf = (content: string, bot: DiscordUser): DiscordUser[] => {
    const ids = [...new Set([...content.matchAll(/<@!?(\d{1,20})>/g)].map(found => found[1]))]
    return ids.map(id => id === bot.id ? bot : memberUserOf(id))
  }

  const inbound = (input: BotSimulateInput, connection: BotPlatformConnection): BotNativeInbound => {
    const state = stateOf(connection.id)
    const bot = botUserOf(connection)
    const kind = input.chat?.kind ?? BotChatKind.Group
    const senderId = snowflakeOf(input.sender?.id, DISCORD_MOCK_SENDER_ID)
    const author: DiscordUser = {
      id: senderId,
      username: input.sender?.username ?? DISCORD_MOCK_SENDER_USERNAME,
      global_name: input.sender?.name ?? DISCORD_MOCK_SENDER_NAME,
      discriminator: '0',
      avatar: null,
      ...(input.sender?.bot === true ? { bot: true } : {}),
    }
    const guild = kind === BotChatKind.Private ? undefined : snowflakeOf(input.chat?.space, DISCORD_MOCK_GUILD_ID)
    const channel = snowflakeOf(input.chat?.id, kind === BotChatKind.Private ? snowflakeOf(`dm:${senderId}`, DISCORD_MOCK_CHANNEL_ID) : DISCORD_MOCK_CHANNEL_ID)
    const now = Date.now()
    const replyId = input.replyTo != null ? snowflakeOf(input.replyTo.id, DISCORD_MOCK_OTHER_ID) : undefined
    const referenced: DiscordMessage | undefined = replyId != null
      ? {
        id: replyId,
        channel_id: channel,
        ...(guild != null ? { guild_id: guild } : {}),
        author: state.sent.has(replyId) ? bot : memberUserOf(DISCORD_MOCK_OTHER_ID),
        content: input.replyTo?.text ?? '',
        timestamp: new Date(now - 60_000).toISOString(),
        edited_timestamp: null,
        mentions: [],
        type: DISCORD_MESSAGE_DEFAULT,
      }
      : undefined
    const content = contentOf(input.text, bot)
    const mentions = mentionsOf(content, bot)
    // A reply mentions the author it answers, as the Discord client does by default.
    if (referenced != null && !mentions.some(user => user.id === referenced.author.id)) {
      mentions.push(referenced.author)
    }
    const message: DiscordMessage = {
      id: nextId(state),
      channel_id: channel,
      ...(guild != null
        ? { guild_id: guild, member: { roles: [], joined_at: new Date(now - 86_400_000).toISOString(), deaf: false, mute: false, flags: 0 } }
        : {}),
      author,
      content,
      timestamp: new Date(now).toISOString(),
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions,
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: referenced != null ? DISCORD_MESSAGE_REPLY : DISCORD_MESSAGE_DEFAULT,
      ...(referenced != null
        ? {
          message_reference: { type: 0, message_id: referenced.id, channel_id: channel, ...(guild != null ? { guild_id: guild } : {}) },
          referenced_message: referenced,
        }
        : {}),
    }
    const frame: DiscordGatewayPayload<DiscordMessage> = { op: DiscordGatewayOp.Dispatch, s: ++state.sequence, t: 'MESSAGE_CREATE', d: message }

    return {
      body: frame,
      rawBody: JSON.stringify(frame),
      // Unsigned: Discord posts no webhooks — the frame reaches the inbox through `simulate` or the fake gateway.
      headers: { 'content-type': 'application/json' },
    }
  }

  /** A dispatch frame from what `feed` got: a frame as is, a bare message as its `MESSAGE_CREATE`. */
  const frameOf = (payload: unknown): DiscordGatewayPayload | null => {
    if (payload == null || typeof payload !== 'object') {
      return null
    }
    const given = payload as Partial<DiscordGatewayPayload> & Partial<DiscordMessage>
    if (typeof given.t === 'string') {
      return { op: DiscordGatewayOp.Dispatch, t: given.t, d: given.d, s: null }
    }

    return typeof given.channel_id === 'string' ? { op: DiscordGatewayOp.Dispatch, t: 'MESSAGE_CREATE', d: payload, s: null } : null
  }

  const deliver = (state: DiscordMockState, entry: DiscordMockSocket, frame: DiscordGatewayPayload): void =>
    entry.push({ ...frame, op: DiscordGatewayOp.Dispatch, s: ++state.sequence })

  const flush = (state: DiscordMockState, entry: DiscordMockSocket): void => {
    while (entry.live && state.queue.length > 0) {
      deliver(state, entry, state.queue.shift()!)
    }
  }

  const socket = (connection: BotPlatformConnection): DiscordSocketFactory => (url: string): DiscordSocket => {
    const state = stateOf(connection.id)
    state.calls.push({ method: 'gateway:connect', params: { url }, at: new Date().toISOString() })
    let readyState = DISCORD_SOCKET_CONNECTING

    const fake: DiscordSocket = {
      get readyState () { return readyState },
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send: data => { receive(data) },
      close: (code = 1000, reason = '') => { shut(code, reason) },
    }

    const push = (payload: DiscordGatewayPayload): void => {
      setTimeout(() => {
        if (readyState === DISCORD_SOCKET_OPEN) {
          fake.onmessage?.({ data: JSON.stringify(payload) })
        }
      }, 0)
    }

    const entry: DiscordMockSocket = { socket: fake, live: false, push }

    const shut = (code: number, reason: string): void => {
      if (readyState >= DISCORD_SOCKET_CLOSING) {
        return
      }
      readyState = DISCORD_SOCKET_CLOSING
      entry.live = false
      state.sockets.delete(entry)
      setTimeout(() => {
        readyState = DISCORD_SOCKET_CLOSED
        fake.onclose?.({ code, reason })
      }, 0)
    }

    const dispatch = (t: string, d: unknown): void => deliver(state, entry, { op: DiscordGatewayOp.Dispatch, t, d })

    const receive = (data: string): void => {
      if (readyState !== DISCORD_SOCKET_OPEN) {
        return
      }
      let frame: DiscordGatewayPayload<Record<string, unknown> | null>
      try {
        frame = JSON.parse(data) as DiscordGatewayPayload<Record<string, unknown> | null>
      } catch {
        shut(4002, 'Error while decoding payload.')
        return
      }
      const at = new Date().toISOString()
      switch (frame.op) {
        case DiscordGatewayOp.Heartbeat:
          push({ op: DiscordGatewayOp.HeartbeatAck, d: null, s: null, t: null })
          return
        case DiscordGatewayOp.Identify: {
          const { token: _token, ...identify } = frame.d ?? {}
          state.calls.push({ method: 'gateway:identify', params: identify, at })
          const bot = botUserOf(connection)
          entry.live = true
          state.sockets.add(entry)
          dispatch('READY', {
            v: 10,
            user: bot,
            guilds: [],
            session_id: randomUUID().replace(/-/g, ''),
            resume_gateway_url: DISCORD_MOCK_RESUME_URL,
            application: { id: connection.credentials?.applicationId || bot.id, flags: 0 },
          })
          flush(state, entry)
          return
        }
        case DiscordGatewayOp.Resume: {
          const { token: _token, ...resume } = frame.d ?? {}
          state.calls.push({ method: 'gateway:resume', params: resume, at })
          entry.live = true
          state.sockets.add(entry)
          dispatch('RESUMED', null)
          flush(state, entry)
          return
        }
        default:
          shut(4001, 'Unknown opcode.')
      }
    }

    setTimeout(() => {
      if (readyState !== DISCORD_SOCKET_CONNECTING) {
        return
      }
      readyState = DISCORD_SOCKET_OPEN
      fake.onopen?.({})
      push({ op: DiscordGatewayOp.Hello, d: { heartbeat_interval: DISCORD_MOCK_HEARTBEAT_MS }, s: null, t: null })
    }, 0)

    return fake
  }

  const feed = (connection: string, payload: unknown): void => {
    const frame = frameOf(payload)
    if (frame == null) {
      return
    }
    const state = stateOf(connection)
    const live = [...state.sockets].find(entry => entry.live)
    if (live != null) {
      deliver(state, live, frame)
      return
    }
    state.queue.push(frame)
  }

  const calls = (connection: string): BotMockCall[] => [...(states.get(connection)?.calls ?? [])]

  /** Forget a connection's state; its open fake sockets close as the gateway would on a fault (4000). */
  const reset = (connection?: string): void => {
    const dropped = connection == null ? [...states.values()] : [states.get(connection)].filter(state => state != null)
    for (const state of dropped) {
      for (const entry of [...state.sockets]) {
        entry.socket.close(4000, 'Unknown error.')
      }
    }
    if (connection == null) {
      states.clear()
    } else {
      states.delete(connection)
    }
  }

  return { fetch, inbound, feed, calls, reset, socket, usernameOf, userIdOf }
}
