import { describe, expect, test } from 'bun:test'
import {
  BotChatKind, BotConnectionStatus, BotPlatform, BotReceiveMode, BotTransport, BotUpdateKind, type BotConnection,
} from '@owlmeans/bot'
import { TELEGRAM_SECRET_HEADER } from '../src/platforms/telegram/consts.js'
import { makeTelegramBotPlatform, telegramBotPlatform } from '../src/platforms/telegram/plugin.js'
import type { BotPlatformConnection } from '../src/platforms/types.js'

/** The bot as `getMe` answered it. */
const connection: BotConnection = {
  id: 'conn-1', scope: 'org', platform: BotPlatform.Telegram, label: 'Guard', transport: BotTransport.Live,
  status: BotConnectionStatus.Connected, enabled: true, receive: BotReceiveMode.Webhook,
  identity: { id: '5000000001', username: 'GuardBot', name: 'Guard' }, credentialsSet: ['token'],
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
}
const plugin = telegramBotPlatform
const group = { id: -1001234567890, title: 'Owl lovers', type: 'supergroup' }
const member = { id: 111222333, is_bot: false, first_name: 'Ann', last_name: 'Lee', username: 'annlee' }
const botUser = { id: 5000000001, is_bot: true, first_name: 'Guard', username: 'GuardBot' }

const one = (payload: unknown) => {
  const updates = plugin.normalize(payload, connection)
  expect(updates.length).toBe(1)
  return updates[0]
}

describe('@owlmeans/server-bot — Telegram normalization (Bot API Update shapes)', () => {
  test('a group text message', () => {
    const { platformId, update } = one({
      update_id: 900001,
      message: { message_id: 51, from: member, chat: group, date: 1761480000, text: 'Free money at the casino' },
    })

    expect(platformId).toBe('900001')
    expect(update).toMatchObject({
      kind: BotUpdateKind.Message,
      chat: { id: '-1001234567890', kind: BotChatKind.Group, title: 'Owl lovers' },
      sender: { id: '111222333', name: 'Ann Lee', username: 'annlee', bot: false },
      message: { ref: { chat: '-1001234567890', id: '51' }, text: 'Free money at the casino', date: '2025-10-26T12:00:00.000Z' },
      addressed: false,
    })
    expect(update.command).toBeUndefined()
  })

  test('a private message is addressed; a basic group is a group', () => {
    const direct = one({
      update_id: 2, message: { message_id: 3, from: member, chat: { id: 111222333, type: 'private', first_name: 'Ann' }, date: 1, text: 'hi' },
    }).update
    expect([direct.chat.kind, direct.chat.title, direct.addressed]).toEqual([BotChatKind.Private, 'Ann', true])
    const basic = one({ update_id: 3, message: { message_id: 4, from: member, chat: { id: -42, type: 'group', title: 'G' }, date: 1, text: 'x' } })
    expect(basic.update.chat.kind).toBe(BotChatKind.Group)
  })

  test('a command addressed to this bot (`/report@GuardBot`) is a command and addressed; another bot\'s is neither', () => {
    const own = one({
      update_id: 4,
      message: {
        message_id: 5, from: member, chat: group, date: 1, text: '/report@GuardBot spam above',
        entities: [{ type: 'bot_command', offset: 0, length: 16 }],
      },
    }).update
    expect([own.kind, own.command, own.addressed]).toEqual([BotUpdateKind.Command, { name: 'report', args: 'spam above' }, true])

    const other = one({
      update_id: 5,
      message: { message_id: 6, from: member, chat: group, date: 1, text: '/report@OtherBot x', entities: [{ type: 'bot_command', offset: 0, length: 16 }] },
    }).update
    expect([other.kind, other.command, other.addressed]).toEqual([BotUpdateKind.Message, undefined, false])
  })

  test('a mention entity (UTF-16 offsets) and a reply to the bot address it', () => {
    const mention = one({
      update_id: 6,
      message: {
        message_id: 7, from: member, chat: group, date: 1, text: '🦉 hey @guardbot, help',
        entities: [{ type: 'mention', offset: 7, length: 9 }],
      },
    }).update
    expect(mention.addressed).toBe(true)

    const reply = one({
      update_id: 7,
      message: {
        message_id: 8, from: member, chat: group, date: 1, text: 'why?',
        reply_to_message: { message_id: 6, from: botUser, chat: group, date: 1, text: 'Message removed' },
      },
    }).update
    expect(reply.addressed).toBe(true)
    expect(reply.message?.replyTo).toEqual({
      chat: '-1001234567890', id: '6', text: 'Message removed', sender: { id: '5000000001', name: 'Guard', username: 'GuardBot', bot: true },
    })
  })

  test('a caption is the text; a forum topic carries its thread', () => {
    const photo = one({
      update_id: 8,
      message: {
        message_id: 9, message_thread_id: 77, is_topic_message: true, from: member, chat: { ...group, is_forum: true },
        date: 1, photo: [{ file_id: 'f' }], caption: 'casino flyer',
      },
    }).update
    expect([photo.message?.text, photo.chat.thread, photo.message?.ref.thread]).toEqual(['casino flyer', '77', '77'])
  })

  test('a channel post (sender_chat, no from) and an edited message', () => {
    const post = one({
      update_id: 9,
      channel_post: { message_id: 10, sender_chat: { id: -1009, title: 'News', type: 'channel' }, chat: { id: -1009, title: 'News', type: 'channel' }, date: 1, text: 'Hello' },
    }).update
    expect([post.kind, post.chat.kind, post.sender]).toEqual([BotUpdateKind.Message, BotChatKind.Channel, { id: '-1009', name: 'News', bot: false }])

    const edited = one({
      update_id: 10,
      edited_message: { message_id: 11, from: member, chat: group, date: 100, edit_date: 200, text: 'now with casino' },
    }).update
    expect([edited.kind, edited.message?.date]).toEqual([BotUpdateKind.Edited, '1970-01-01T00:03:20.000Z'])
  })

  test('kinds the bot does not subscribe to, and garbage, normalize to nothing', () => {
    expect(plugin.normalize({ update_id: 11, my_chat_member: {} }, connection)).toEqual([])
    expect(plugin.normalize({ nope: true }, connection)).toEqual([])
    expect(plugin.normalize(null, connection)).toEqual([])
  })
})

describe('@owlmeans/server-bot — Telegram hook, API base and mock', () => {
  const platformConnection: BotPlatformConnection = { ...connection, credentials: { token: '1:x' }, hookSecret: 'the-secret_1' }

  test('authenticate compares X-Telegram-Bot-Api-Secret-Token with the connection\'s secret', () => {
    const post = (headers: Record<string, string>) => plugin.authenticate({ method: 'POST', headers, body: {} }, platformConnection)

    expect(post({ [TELEGRAM_SECRET_HEADER]: 'the-secret_1' })).toEqual({ result: 'ok' })
    expect(post({ 'X-Telegram-Bot-Api-Secret-Token': 'the-secret_1' })).toEqual({ result: 'ok' })
    expect(post({ [TELEGRAM_SECRET_HEADER]: 'the-secret_2' })).toEqual({ result: 'reject', reason: 'secret-token' })
    expect(post({})).toEqual({ result: 'reject', reason: 'secret-token' })
  })

  test('calls go to `<base>/bot<token>/<method>` — the base is overridable', async () => {
    const urls: string[] = []
    const selfHosted = makeTelegramBotPlatform({ base: 'https://bots.example.org/' })
    const identity = await selfHosted.verify({
      connection: platformConnection,
      transport: BotTransport.Live,
      fetch: async (url, init) => {
        urls.push(url)
        expect(init?.method).toBe('POST')
        return new Response(JSON.stringify({ ok: true, result: botUser }))
      },
    })

    expect(urls).toEqual(['https://bots.example.org/bot1:x/getMe'])
    expect(identity).toEqual({ id: '5000000001', username: 'GuardBot', name: 'Guard' })
  })

  test('the mock answers like the Bot API: envelopes, incrementing message ids, refusals', async () => {
    const mockConnection = { ...platformConnection, id: `mock-${Date.now()}`, transport: BotTransport.Mock }
    const fetch = plugin.mock.fetch(mockConnection)
    const send = async (body: object): Promise<any> => await (await fetch('https://api.telegram.org/bot/sendMessage', { method: 'POST', body: JSON.stringify(body) })).json()

    const first = await send({ chat_id: -100, text: 'one' })
    const second = await send({ chat_id: -100, text: 'two' })
    expect([first.ok, second.result.message_id - first.result.message_id, first.result.from.is_bot]).toEqual([true, 1, true])
    expect(await send({ chat_id: -100, text: '' })).toEqual({ ok: false, error_code: 400, description: 'Bad Request: message text is empty' })
    expect(plugin.mock.calls(mockConnection.id).map(call => call.method)).toEqual(['sendMessage', 'sendMessage', 'sendMessage'])
  })
})
