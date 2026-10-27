import { describe, expect, test } from 'bun:test'
import {
  BotConnectionNotFound, BotPlatform, BotSignatureRejected, BotTransport, BotTransportMismatch, BotUpdateKind,
} from '@owlmeans/bot'
import { BotInboxStatus } from '../src/consts.js'
import { BotConnectionDisabled } from '../src/errors.js'
import { botHandler } from '../src/handler.js'
import { botMockHelper } from '../src/mock/index.js'
import { makeDiscordBotPlatform } from '../src/platforms/discord/plugin.js'
import { makeSlackBotPlatform } from '../src/platforms/slack/plugin.js'
import { TELEGRAM_SECRET_HEADER } from '../src/platforms/telegram/consts.js'
import { makeTelegramBotPlatform } from '../src/platforms/telegram/plugin.js'
import type { BotNativeInbound, BotPlatformPlugin } from '../src/platforms/types.js'
import { makeWhatsAppBotPlatform } from '../src/platforms/whatsapp/plugin.js'
import { makeTestBot, scopeOf, type TestBot } from './context.js'

const mockConnection = async (bot: TestBot, scope: string) => {
  const saved = await bot.service.connections.save(scope, { platform: BotPlatform.Telegram, label: 'Mock', transport: BotTransport.Mock })
  await bot.service.connections.verify(scope, saved.id)
  return await bot.connections.get(saved.id)
}

describe('@owlmeans/server-bot — receive and simulate', () => {
  test('simulate builds a native group update, signs it and stores it pending', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const record = await mockConnection(bot, scope)

    const { update } = await bot.service.simulate(scope, record.id!, { text: 'hello group' })
    const row = await bot.updates.get(update)

    expect([row.status, row.attempts, row.scope, row.connection, row.platform]).toEqual(
      [BotInboxStatus.Pending, 0, scope, record.id!, BotPlatform.Telegram]
    )
    expect(row.update).toMatchObject({ kind: BotUpdateKind.Message, chat: { kind: 'group' }, message: { text: 'hello group' }, addressed: false })
    expect((await bot.service.connections.get(scope, record.id!)).lastEventAt).toBe(row.receivedAt)
  })

  test('a redelivered update is stored once', async () => {
    const bot = makeTestBot()
    const record = await mockConnection(bot, scopeOf())
    const inbound = botMockHelper.inbound(BotPlatform.Telegram, { text: 'twice' }, record)
    const request = { method: 'POST', headers: inbound.headers, body: inbound.body, rawBody: inbound.rawBody }

    const first = await bot.service.receive(BotPlatform.Telegram, record.id!, request)
    const second = await bot.service.receive(BotPlatform.Telegram, record.id!, request)

    expect(first.reply).toEqual({ ok: true })
    expect(second.updates).toEqual(first.updates)
    expect(await bot.updates.count({ connection: record.id })).toBe(1)
  })

  test('a wrong or missing secret token is rejected, and nothing is stored', async () => {
    const bot = makeTestBot()
    const record = await mockConnection(bot, scopeOf())
    const inbound = botMockHelper.inbound(BotPlatform.Telegram, { text: 'forged' }, { ...record, hookSecret: 'not-the-secret' })
    const { [TELEGRAM_SECRET_HEADER]: _dropped, ...unsigned } = inbound.headers

    await expect(bot.service.receive(BotPlatform.Telegram, record.id!, { method: 'POST', headers: inbound.headers, body: inbound.body }))
      .rejects.toBeInstanceOf(BotSignatureRejected)
    await expect(bot.service.receive(BotPlatform.Telegram, record.id!, { method: 'POST', headers: unsigned, body: inbound.body }))
      .rejects.toBeInstanceOf(BotSignatureRejected)
    await expect(bot.service.receive(BotPlatform.Telegram, record.id!, { method: 'GET', headers: { [TELEGRAM_SECRET_HEADER]: record.hookSecret } }))
      .rejects.toBeInstanceOf(BotSignatureRejected)
    await expect(bot.service.receive(BotPlatform.Discord, record.id!, { method: 'POST', headers: inbound.headers, body: inbound.body }))
      .rejects.toBeInstanceOf(BotConnectionNotFound)
    expect(await bot.updates.count({ connection: record.id })).toBe(0)
  })

  test('simulate is for mock connections; a disabled one takes nothing', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const live = await bot.service.connections.save(scope, { platform: BotPlatform.Telegram, label: 'Live', credentials: { token: '1:x' } })
    await expect(bot.service.simulate(scope, live.id, { text: 'x' })).rejects.toBeInstanceOf(BotTransportMismatch)

    const record = await mockConnection(bot, scope)
    await bot.service.connections.save(scope, { id: record.id, platform: BotPlatform.Telegram, label: 'Mock', enabled: false })
    await expect(bot.service.simulate(scope, record.id!, { text: 'x' })).rejects.toBeInstanceOf(BotConnectionDisabled)
    const signed = botMockHelper.inbound(BotPlatform.Telegram, { text: 'while off' }, record)
    const answer = await bot.service.receive(BotPlatform.Telegram, record.id!, { method: 'POST', headers: signed.headers, body: signed.body })
    expect([answer.reply, answer.updates]).toEqual([{ ok: true }, []])
  })
})

describe('@owlmeans/server-bot — simulate across restarts and replays', () => {
  /** A seen-recording handler's runtime: dispatch by hand, never started. */
  const watch = (bot: TestBot) => {
    const seen: string[] = []
    const runtime = bot.service.runtime([botHandler('seen', async update => { seen.push(update.id) })])
    return { seen, runtime }
  }

  const makers: [BotPlatform, () => BotPlatformPlugin][] = [
    [BotPlatform.Telegram, makeTelegramBotPlatform],
    [BotPlatform.WhatsApp, makeWhatsAppBotPlatform],
    [BotPlatform.Discord, makeDiscordBotPlatform],
    [BotPlatform.Slack, makeSlackBotPlatform],
  ]

  for (const [platform, make] of makers) {
    test(`${platform}: a message simulated after a restart (fresh plugin, same connection and store) is stored and dispatched`, async () => {
      const scope = scopeOf()
      const before = makeTestBot({ platforms: [make()] })
      const saved = await before.service.connections.save(scope, { platform, label: 'Mock', transport: BotTransport.Mock })
      await before.service.connections.verify(scope, saved.id)
      const first = await before.service.simulate(scope, saved.id, { text: 'before the restart' })
      expect(await watch(before).runtime.dispatch()).toBe(1)

      const after = makeTestBot({ platforms: [make()] }, before.store)
      const { seen, runtime } = watch(after)
      const second = await after.service.simulate(scope, saved.id, { text: 'after the restart' })

      expect([first.duplicate, second.duplicate, second.update === first.update]).toEqual([false, false, false])
      expect(await runtime.dispatch()).toBe(1)
      expect(seen).toEqual([second.update])
      expect((await after.updates.get(second.update)).status).toBe(BotInboxStatus.Done)
    })
  }

  test('the exact native payload simulated again answers its row with duplicate: true — nothing new is dispatched', async () => {
    const telegram = makeTelegramBotPlatform()
    let replay: BotNativeInbound | undefined
    // A mock that hands out the payload it built first again — what a mock counting from a fixed id did after a restart.
    const replaying: BotPlatformPlugin = {
      ...telegram, mock: { ...telegram.mock, inbound: (input, connection) => (replay ??= telegram.mock.inbound(input, connection)) },
    }
    const bot = makeTestBot({ platforms: [replaying] })
    const scope = scopeOf()
    const saved = await bot.service.connections.save(scope, { platform: BotPlatform.Telegram, label: 'Mock', transport: BotTransport.Mock })
    await bot.service.connections.verify(scope, saved.id)
    const { seen, runtime } = watch(bot)

    const first = await bot.service.simulate(scope, saved.id, { text: 'once' })
    expect(await runtime.dispatch()).toBe(1)
    const again = await bot.service.simulate(scope, saved.id, { text: 'once more' })

    expect([first.duplicate, again.duplicate, again.update]).toEqual([false, true, first.update])
    expect(await runtime.dispatch()).toBe(0)
    expect(seen).toEqual([first.update])
    expect(await bot.updates.count({ connection: saved.id })).toBe(1)
  })
})
