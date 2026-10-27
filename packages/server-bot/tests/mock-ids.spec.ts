import { describe, expect, test } from 'bun:test'
import {
  BOT_PLATFORMS, BotConnectionStatus, BotPlatform, BotTransport, type BotSimulateInput,
} from '@owlmeans/bot'
import { DISCORD_EPOCH } from '../src/platforms/discord/consts.js'
import { makeDiscordBotPlatform } from '../src/platforms/discord/plugin.js'
import { makeSlackBotPlatform } from '../src/platforms/slack/plugin.js'
import { TELEGRAM_ID_MAX } from '../src/platforms/telegram/consts.js'
import { makeTelegramBotPlatform } from '../src/platforms/telegram/plugin.js'
import type { BotPlatformConnection, BotPlatformMock } from '../src/platforms/types.js'
import { makeWhatsAppBotPlatform } from '../src/platforms/whatsapp/plugin.js'
import type { WhatsAppMock } from '../src/platforms/whatsapp/types.js'

/** One stored mock connection, as each "process" of a test opens it. */
const connectionOf = (platform: BotPlatform): BotPlatformConnection => ({
  id: `conn-${platform}`, scope: 'org', platform, label: 'Mock', transport: BotTransport.Mock,
  status: BotConnectionStatus.Connected, enabled: true, receive: BOT_PLATFORMS[platform].receive[0], credentialsSet: [],
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', credentials: {}, hookSecret: 'hook-secret',
})

const input: BotSimulateInput = { text: 'hello' }

/** The native body of a simulated message, built by `mock`. */
const bodyOf = (mock: BotPlatformMock, platform: BotPlatform): any => mock.inbound(input, connectionOf(platform)).body

/** Eight fresh mocks — eight process lifetimes of the same connection. */
const lifetimes = <T>(make: () => { mock: BotPlatformMock }, read: (mock: BotPlatformMock) => T): T[] =>
  Array.from({ length: 8 }, () => read(make().mock))

const int32 = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= TELEGRAM_ID_MAX

describe('@owlmeans/server-bot — mock ids: the platform\'s shapes, unique across restarts and processes', () => {
  test('Telegram: update_id and message_id (inbound and sent) are positive 32-bit integers; each lifetime starts elsewhere', async () => {
    const plugin = makeTelegramBotPlatform()
    const [one, two] = [bodyOf(plugin.mock, BotPlatform.Telegram), bodyOf(plugin.mock, BotPlatform.Telegram)]
    const sent: any = await (await plugin.mock.fetch(connectionOf(BotPlatform.Telegram))(
      'https://api.telegram.org/bot/sendMessage', { method: 'POST', body: JSON.stringify({ chat_id: -100, text: 'hi' }) }
    )).json()
    const firsts = lifetimes(makeTelegramBotPlatform, mock => bodyOf(mock, BotPlatform.Telegram).update_id)

    expect([one.update_id, one.message.message_id, two.update_id, sent.result.message_id, ...firsts].every(int32)).toBe(true)
    expect(two.update_id - one.update_id).toBe(1)
    expect(new Set([one.update_id, ...firsts]).size).toBe(firsts.length + 1)
  })

  test('WhatsApp: every wamid (inbound and sent) is fresh and random', async () => {
    const plugin = makeWhatsAppBotPlatform()
    const idOf = (mock: BotPlatformMock): string => bodyOf(mock, BotPlatform.WhatsApp).entry[0].changes[0].value.messages[0].id
    const connection = connectionOf(BotPlatform.WhatsApp)
    const sent: any = await (await plugin.mock.fetch(connection)(
      `https://graph.facebook.com/v26.0/${(plugin.mock as WhatsAppMock).phoneNumberIdOf(connection)}/messages`,
      { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', to: '15550001', type: 'text', text: { body: 'hi' } }) }
    )).json()
    const ids = [idOf(plugin.mock), sent.messages[0].id, ...lifetimes(makeWhatsAppBotPlatform, idOf)]

    expect(ids.every(id => /^wamid\.[A-Za-z0-9+/]+=*$/.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('Discord: snowflakes carry the current time, grow within a lifetime and differ across lifetimes of one millisecond', () => {
    const start = Date.now()
    const plugin = makeDiscordBotPlatform()
    const [one, two] = [bodyOf(plugin.mock, BotPlatform.Discord).d.id, bodyOf(plugin.mock, BotPlatform.Discord).d.id] as string[]
    const ids = [one, two, ...lifetimes(makeDiscordBotPlatform, mock => bodyOf(mock, BotPlatform.Discord).d.id as string)]
    const minted = Number(BigInt(one) >> 22n) + DISCORD_EPOCH

    expect(ids.every(id => /^\d{17,20}$/.test(id))).toBe(true)
    expect([minted >= start, minted <= Date.now(), BigInt(two) > BigInt(one)]).toEqual([true, true, true])
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('Slack: ts is now with a unique microsecond part, event_id is random; both differ across lifetimes', () => {
    const plugin = makeSlackBotPlatform()
    const one = bodyOf(plugin.mock, BotPlatform.Slack)
    const bodies = [one, bodyOf(plugin.mock, BotPlatform.Slack), ...lifetimes(makeSlackBotPlatform, mock => bodyOf(mock, BotPlatform.Slack))]
    const stamps = bodies.map(body => body.event.ts as string)
    const events = bodies.map(body => body.event_id as string)

    expect(stamps.every(ts => /^\d{10}\.\d{6}$/.test(ts))).toBe(true)
    expect(Math.abs(Number(one.event.ts) - Date.now() / 1000)).toBeLessThan(5)
    expect(events.every(id => /^Ev[0-9A-Z]{10}$/.test(id))).toBe(true)
    expect([new Set(stamps).size, new Set(events).size]).toEqual([bodies.length, bodies.length])
  })
})
