import { createHash, randomInt } from 'node:crypto'
import { BotChatKind, type BotSimulateInput } from '@owlmeans/bot'
import type { BotFetch, BotFetchInit, BotMockCall, BotNativeInbound, BotPlatformConnection } from '../types.js'
import {
  TELEGRAM_ID_MAX, TELEGRAM_MOCK_GROUP_ID, TELEGRAM_MOCK_GROUP_TITLE, TELEGRAM_MOCK_ID_HEADROOM,
  TELEGRAM_MOCK_SENDER_ID, TELEGRAM_MOCK_SENDER_NAME, TELEGRAM_SECRET_HEADER, TELEGRAM_TEXT_MAX,
} from './consts.js'
import type {
  TelegramChat, TelegramEnvelope, TelegramMessage, TelegramMessageEntity, TelegramMock, TelegramMockState,
  TelegramUpdate, TelegramUser,
} from './types.js'

/**
 * The Bot API, faked per connection and in process: the same URLs, envelopes and result shapes the
 * real server answers, no network. `getMe` answers a stable bot (`mock_<id>_bot`), `sendMessage`
 * returns a message with a fresh id, the moderation calls answer `true`, and `getUpdates`
 * long-polls the connection's feed.
 *
 * Update and message ids start at a random point of the 32-bit range for every state and count up
 * from there: a restarted process, or another one (the api simulates, the worker sends), never hands
 * out the ids an inbox or an activity already holds.
 */
export const makeTelegramMock = (): TelegramMock => {
  const states = new Map<string, TelegramMockState>()

  /** A random start with a lifetime's headroom below the 32-bit top. */
  const startOf = (): number => randomInt(1, TELEGRAM_ID_MAX - TELEGRAM_MOCK_ID_HEADROOM)

  const stateOf = (connection: string): TelegramMockState => {
    let state = states.get(connection)
    if (state == null) {
      state = { nextUpdateId: startOf(), nextMessageId: startOf(), queue: [], waiters: new Set(), calls: [], sent: new Set() }
      states.set(connection, state)
    }

    return state
  }

  /** The next id of a sequence; past the 32-bit top it starts afresh at a random point. */
  const mint = (state: TelegramMockState, sequence: 'nextUpdateId' | 'nextMessageId'): number => {
    const id = state[sequence] <= TELEGRAM_ID_MAX ? state[sequence] : startOf()
    state[sequence] = id + 1

    return id
  }

  /** A stable non-negative integer below `modulo`, derived from a text. */
  const hashOf = (text: string, modulo: number): number =>
    Number.parseInt(createHash('sha256').update(text).digest('hex').slice(0, 12), 16) % modulo

  const usernameOf = (connection: string): string =>
    `mock_${connection.replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'bot'}_bot`

  const botUserOf = (connection: BotPlatformConnection): TelegramUser => ({
    id: 5_000_000_000 + hashOf(connection.id, 1_000_000_000),
    is_bot: true,
    first_name: connection.label !== '' ? connection.label : 'Mock bot',
    username: usernameOf(connection.id),
  })

  /** A Telegram id from a simulated one: a number stays itself, any other text maps to a stable number. */
  const numericOf = (value: string | undefined, fallback: number, negative: boolean): number => {
    if (value == null || value === '') {
      return fallback
    }
    if (/^-?\d{1,15}$/.test(value)) {
      return Number(value)
    }
    const hashed = 1_000_000 + hashOf(value, 1_000_000_000)

    return negative ? -(1_000_000_000_000 + hashed) : hashed
  }

  const answer = <T>(envelope: TelegramEnvelope<T>): Response =>
    new Response(JSON.stringify(envelope), {
      status: envelope.ok ? 200 : envelope.error_code ?? 400,
      headers: { 'content-type': 'application/json' },
    })

  const aborted = (): Error => {
    const error = new Error('The operation was aborted.')
    error.name = 'AbortError'
    return error
  }

  const wake = (state: TelegramMockState): void => {
    const waiters = [...state.waiters]
    state.waiters.clear()
    waiters.forEach(wakeUp => wakeUp())
  }

  /** `getUpdates`: drop what `offset` confirms, answer what is queued, else wait for the feed. */
  const getUpdates = async (
    state: TelegramMockState, params: Record<string, unknown>, signal?: AbortSignal
  ): Promise<TelegramUpdate[]> => {
    const confirm = (): void => {
      if (typeof params.offset === 'number') {
        const offset = params.offset
        state.queue = state.queue.filter(update => update.update_id >= offset)
      }
    }
    confirm()
    const limit = typeof params.limit === 'number' ? params.limit : 100
    const timeout = typeof params.timeout === 'number' ? params.timeout : 0
    if (state.queue.length === 0 && timeout > 0) {
      await new Promise<void>((resolve, reject) => {
        const done = (): void => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', abort)
          state.waiters.delete(done)
          resolve()
        }
        const abort = (): void => {
          clearTimeout(timer)
          state.waiters.delete(done)
          reject(aborted())
        }
        const timer = setTimeout(done, timeout * 1000)
        state.waiters.add(done)
        signal?.addEventListener('abort', abort, { once: true })
      })
    }

    return state.queue.slice(0, limit)
  }

  const fetch = (connection: BotPlatformConnection): BotFetch => async (url: string, init?: BotFetchInit) => {
    if (init?.signal?.aborted === true) {
      throw aborted()
    }
    const method = new URL(url).pathname.split('/').pop() ?? ''
    let params: Record<string, unknown> = {}
    try {
      params = init?.body != null && init.body !== '' ? JSON.parse(init.body) as Record<string, unknown> : {}
    } catch {
      return answer({ ok: false, error_code: 400, description: 'Bad Request: can\'t parse JSON' })
    }
    const state = stateOf(connection.id)
    state.calls.push({ method, params, at: new Date().toISOString() })
    const bot = botUserOf(connection)

    switch (method) {
      case 'getMe':
        return answer({ ok: true, result: bot })
      case 'setWebhook':
        state.webhook = typeof params.url === 'string' ? params.url : undefined
        return answer({ ok: true, result: true, description: 'Webhook was set' })
      case 'deleteWebhook':
        state.webhook = undefined
        return answer({ ok: true, result: true, description: 'Webhook was deleted' })
      case 'getUpdates':
        return answer({ ok: true, result: await getUpdates(state, params, init?.signal) })
      case 'sendMessage': {
        const text = typeof params.text === 'string' ? params.text : ''
        if (params.chat_id == null) {
          return answer({ ok: false, error_code: 400, description: 'Bad Request: chat_id is empty' })
        }
        if (text.trim() === '' || text.length > TELEGRAM_TEXT_MAX) {
          return answer({ ok: false, error_code: 400, description: text.trim() === '' ? 'Bad Request: message text is empty' : 'Bad Request: message is too long' })
        }
        const chatId = Number(params.chat_id)
        const messageId = mint(state, 'nextMessageId')
        state.sent.add(messageId)
        const message: TelegramMessage = {
          message_id: messageId,
          from: bot,
          chat: chatId < 0
            ? { id: chatId, type: 'supergroup', title: TELEGRAM_MOCK_GROUP_TITLE }
            : { id: chatId, type: 'private', first_name: TELEGRAM_MOCK_SENDER_NAME },
          date: Math.floor(Date.now() / 1000),
          text,
          ...(typeof params.message_thread_id === 'number'
            ? { message_thread_id: params.message_thread_id, is_topic_message: true }
            : {}),
        }
        return answer({ ok: true, result: message })
      }
      case 'deleteMessage':
      case 'restrictChatMember':
      case 'banChatMember':
      case 'setMessageReaction':
        return answer({ ok: true, result: true })
      default:
        return answer({ ok: false, error_code: 404, description: 'Not Found' })
    }
  }

  /** `bot_command` and `mention` entities, as the server would attach them. */
  const entitiesOf = (text: string): TelegramMessageEntity[] => {
    const entities: TelegramMessageEntity[] = []
    const command = /^\/[A-Za-z0-9_]{1,64}(?:@[A-Za-z0-9_]{1,64})?/.exec(text)
    if (command != null) {
      entities.push({ type: 'bot_command', offset: 0, length: command[0].length })
    }
    for (const mention of text.matchAll(/(?<![A-Za-z0-9_])@[A-Za-z0-9_]{3,32}/g)) {
      if (command == null || (mention.index ?? 0) >= command[0].length) {
        entities.push({ type: 'mention', offset: mention.index ?? 0, length: mention[0].length })
      }
    }

    return entities
  }

  const inbound = (input: BotSimulateInput, connection: BotPlatformConnection): BotNativeInbound => {
    const state = stateOf(connection.id)
    const kind = input.chat?.kind ?? BotChatKind.Group
    const senderId = numericOf(input.sender?.id, TELEGRAM_MOCK_SENDER_ID, false)
    const sender: TelegramUser = {
      id: senderId,
      is_bot: input.sender?.bot ?? false,
      first_name: input.sender?.name ?? TELEGRAM_MOCK_SENDER_NAME,
      ...(input.sender?.username != null ? { username: input.sender.username } : {}),
    }
    const chat: TelegramChat = kind === BotChatKind.Private
      ? { id: numericOf(input.chat?.id, senderId, false), type: 'private', first_name: sender.first_name }
      : {
        id: numericOf(input.chat?.id, TELEGRAM_MOCK_GROUP_ID, true),
        type: kind === BotChatKind.Channel ? 'channel' : 'supergroup',
        title: input.chat?.title ?? TELEGRAM_MOCK_GROUP_TITLE,
        ...(input.chat?.thread != null ? { is_forum: true } : {}),
      }
    const date = Math.floor(Date.now() / 1000)
    const entities = entitiesOf(input.text)
    const thread = input.chat?.thread != null ? numericOf(input.chat.thread, 1, false) : undefined
    const replyId = input.replyTo != null ? numericOf(input.replyTo.id, 1, false) : undefined
    const message: TelegramMessage = {
      message_id: mint(state, 'nextMessageId'),
      ...(thread != null ? { message_thread_id: thread, is_topic_message: true } : {}),
      ...(kind === BotChatKind.Channel ? { sender_chat: chat } : { from: sender }),
      chat,
      date,
      text: input.text,
      ...(entities.length > 0 ? { entities } : {}),
      ...(input.replyTo != null && replyId != null
        ? {
          reply_to_message: {
            message_id: replyId,
            from: state.sent.has(replyId)
              ? botUserOf(connection)
              : { id: TELEGRAM_MOCK_SENDER_ID + 1, is_bot: false, first_name: 'Another member' },
            chat,
            date: date - 60,
            ...(input.replyTo.text != null ? { text: input.replyTo.text } : {}),
          },
        }
        : {}),
    }
    const update: TelegramUpdate = {
      update_id: mint(state, 'nextUpdateId'),
      ...(kind === BotChatKind.Channel ? { channel_post: message } : { message }),
    }
    const rawBody = JSON.stringify(update)

    return {
      body: update,
      rawBody,
      headers: { 'content-type': 'application/json', [TELEGRAM_SECRET_HEADER]: connection.hookSecret },
    }
  }

  const feed = (connection: string, payload: unknown): void => {
    const state = stateOf(connection)
    const update = { ...(payload as TelegramUpdate) }
    if (typeof update.update_id !== 'number') {
      update.update_id = mint(state, 'nextUpdateId')
    } else if (update.update_id >= state.nextUpdateId) {
      state.nextUpdateId = update.update_id + 1
    }
    state.queue.push(update)
    wake(state)
  }

  const calls = (connection: string): BotMockCall[] => [...(states.get(connection)?.calls ?? [])]

  const reset = (connection?: string): void => {
    if (connection == null) {
      states.forEach(wake)
      states.clear()
      return
    }
    const state = states.get(connection)
    if (state != null) {
      wake(state)
      states.delete(connection)
    }
  }

  return { fetch, inbound, feed, calls, reset, usernameOf }
}
