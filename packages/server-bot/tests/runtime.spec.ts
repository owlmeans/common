import { afterEach, describe, expect, test } from 'bun:test'
import {
  BotActionKind, BotChatKind, BotPlatform, BotRuleAction, BotTransport, type BotUpdate,
} from '@owlmeans/bot'
import { BotInboxStatus } from '../src/consts.js'
import { botHandler } from '../src/handler.js'
import { botMockHelper } from '../src/mock/index.js'
import { telegramBotPlatform } from '../src/platforms/telegram/plugin.js'
import { whatsappBotPlatform } from '../src/platforms/whatsapp/plugin.js'
import type { BotRuntime } from '../src/types.js'
import { makeTestBot, scopeOf, until, type TestBot } from './context.js'

const runtimes: BotRuntime[] = []
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(async runtime => { await runtime.stop() }))
})

const connect = async (bot: TestBot, scope: string) => {
  const saved = await bot.service.connections.save(scope, { platform: BotPlatform.Telegram, label: 'Guard', transport: BotTransport.Mock })
  return await bot.service.connections.verify(scope, saved.id)
}

describe('@owlmeans/server-bot — runtime and actions', () => {
  test('simulate → inbox → a handler deletes and replies: activity recorded as mock, with its targets', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    const spam = await bot.service.rules.save(scope, { name: 'Spam', keywords: ['casino'], action: BotRuleAction.Delete })
    const seen: BotUpdate[] = []
    const runtime = bot.service.runtime([botHandler('moderate', async (update, actions) => {
      seen.push(update)
      for (const match of update.matches) {
        if (match.rule.action === BotRuleAction.Delete) {
          expect((await actions.delete(update, { rule: match.rule.id })).ok).toBe(true)
          const reply = await actions.reply(update, 'Removed: casino links are not allowed.', { rule: match.rule.id })
          expect(reply.ok).toBe(true)
          expect(reply.message?.chat).toBe(update.chat.id)
        }
      }
    })])
    runtimes.push(runtime)

    const { update } = await bot.service.simulate(scope, connection.id, { text: 'Best CASINO in town', sender: { id: '777', name: 'Spammer' } })
    expect(await runtime.dispatch()).toBe(1)

    expect(seen.map(entry => [entry.id, entry.matches.map(match => match.rule.id), entry.sender?.id])).toEqual([[update, [spam.id], '777']])
    expect((await bot.updates.get(update)).status).toBe(BotInboxStatus.Done)
    const [message] = seen
    const activity = await bot.service.activity.list(scope)
    expect(activity.map(entry => [entry.action, entry.ok, entry.transport, entry.rule, entry.update, entry.target])).toEqual([
      [BotActionKind.Reply, true, BotTransport.Mock, spam.id, update, { chat: message.chat.id, message: message.message!.ref.id }],
      [BotActionKind.Delete, true, BotTransport.Mock, spam.id, update, { chat: message.chat.id, message: message.message!.ref.id }],
    ])
    const calls = telegramBotPlatform.mock.calls(connection.id)
    expect(calls.find(call => call.method === 'deleteMessage')?.params).toEqual({
      chat_id: Number(message.chat.id), message_id: Number(message.message!.ref.id),
    })
    expect(calls.find(call => call.method === 'sendMessage')?.params).toMatchObject({
      chat_id: Number(message.chat.id), reply_parameters: { message_id: Number(message.message!.ref.id), allow_sending_without_reply: true },
    })
  })

  test('mute, ban and react reach the platform with Telegram\'s parameters', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    const runtime = bot.service.runtime([botHandler('punish', async (update, actions) => {
      await actions.mute(update, { minutes: 60 })
      await actions.ban({ chat: update.chat, user: update.sender!.id })
      await actions.react(update, '👎')
      await actions.note(update, 'Punished')
    })])
    runtimes.push(runtime)
    const before = Math.floor(Date.now() / 1000)
    await bot.service.simulate(scope, connection.id, { text: 'rude' })
    await runtime.dispatch()

    const calls = telegramBotPlatform.mock.calls(connection.id)
    const restrict = calls.find(call => call.method === 'restrictChatMember')!.params
    expect(restrict).toMatchObject({ user_id: 424242001, use_independent_chat_permissions: true, permissions: { can_send_messages: false } })
    expect(Number(restrict.until_date) - before).toBeGreaterThanOrEqual(3600)
    expect(calls.find(call => call.method === 'banChatMember')!.params).toMatchObject({ user_id: 424242001 })
    expect(calls.find(call => call.method === 'setMessageReaction')!.params).toMatchObject({ reaction: [{ type: 'emoji', emoji: '👎' }] })
    expect((await bot.service.activity.list(scope)).map(entry => entry.action)).toEqual(
      [BotActionKind.Note, BotActionKind.React, BotActionKind.Ban, BotActionKind.Mute]
    )
  })

  test('a failing handler is retried and the update fails after `attempts`; completed handlers are not re-run', async () => {
    const bot = makeTestBot({ attempts: 3 })
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    let quiet = 0
    let flaky = 0
    const runtime = bot.service.runtime([
      botHandler('quiet', async () => { quiet++ }),
      botHandler('flaky', async () => { flaky++; throw new Error('model unavailable') }),
    ])
    runtimes.push(runtime)
    const { update } = await bot.service.simulate(scope, connection.id, { text: 'hi' })

    await until(async () => {
      await runtime.dispatch()
      return (await bot.updates.get(update)).status === BotInboxStatus.Failed
    })
    const row = await bot.updates.get(update)
    expect([quiet, flaky, row.attempts, row.handled]).toEqual([1, 3, 3, ['quiet']])
    expect(row.error).toBe('flaky: model unavailable')
  })

  test('an unsupported action answers ok:false with a sentence and its marker, and records both — it never throws', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const saved = await bot.service.connections.save(scope, { platform: BotPlatform.WhatsApp, label: 'Shop', transport: BotTransport.Mock })
    const actions = await bot.service.actions({ scope, connection: saved.id })

    expect([actions.supports(BotActionKind.Reply), actions.supports(BotActionKind.Delete), actions.supports(BotActionKind.Note)])
      .toEqual([true, false, true])
    const removed = await actions.delete({ chat: '15550001', id: 'wamid.1' })
    expect(removed).toEqual({
      ok: false, error: 'WhatsApp cannot delete messages.', code: 'bot:unsupported-action:delete',
    })
    const [activity] = await bot.service.activity.list(scope)
    expect(activity).toMatchObject({
      action: BotActionKind.Delete, ok: false, error: removed.error, code: 'bot:unsupported-action:delete', transport: BotTransport.Mock,
    })
    expect(whatsappBotPlatform.mock.calls(saved.id)).toEqual([])

    const nobody = await bot.service.actions({ scope, connection: 'missing' })
    expect(await nobody.send('1', 'x')).toEqual({
      ok: false, error: 'The bot connection does not exist.', code: 'bot:connection-not-found:missing',
    })
    expect(await actions.reply({ chat: '15550001', id: 'wamid.1' }, '   ')).toEqual({
      ok: false, error: 'The text is empty.', code: 'bot:invalid-action:empty-text',
    })
    expect(await actions.mute({ chat: '15550001', user: '15550001' }, { minutes: 5 })).toMatchObject({
      ok: false, code: 'bot:unsupported-action:mute',
    })
  })

  test('a platform\'s refusal and a guild-less mute answer one short sentence; the marker stays in `code`', async () => {
    const bot = makeTestBot({
      // The Bot API as a live connection reaches it, refusing the delete the way Telegram words it.
      fetch: async url => new Response(JSON.stringify(url.endsWith('/deleteMessage')
        ? { ok: false, error_code: 400, description: 'Bad Request: message to delete not found' }
        : { ok: true, result: true })),
    })
    const scope = scopeOf()
    const live = await bot.service.connections.save(scope, { platform: BotPlatform.Telegram, label: 'Live', credentials: { token: '1:x' } })
    const telegram = await bot.service.actions({ scope, connection: live.id })
    expect(await telegram.delete({ chat: '-100', id: '7' })).toEqual({
      ok: false,
      error: 'Telegram refused: Bad Request: message to delete not found.',
      code: 'bot:telegram:400:Bad Request: message to delete not found',
    })

    const discord = await bot.service.connections.save(scope, { platform: BotPlatform.Discord, label: 'Guard', transport: BotTransport.Mock })
    const guard = await bot.service.actions({ scope, connection: discord.id })
    expect(await guard.mute({ chat: '1100000000000000002', user: '1100000000000000003' }, { minutes: 5 })).toEqual({
      ok: false,
      error: 'Discord can mute members only in a server, and this chat is in none.',
      code: 'bot:invalid-action:no-guild:mute',
    })
    expect((await bot.service.activity.list(scope)).map(entry => [entry.action, entry.code])).toEqual([
      [BotActionKind.Mute, 'bot:invalid-action:no-guild:mute'],
      [BotActionKind.Delete, 'bot:telegram:400:Bad Request: message to delete not found'],
    ])
  })

  test('a poll connection\'s receiver drains the mock feed into the inbox; stop() aborts it', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    const record = await bot.connections.get(connection.id)
    const seen: string[] = []
    const runtime = bot.service.runtime([botHandler('echo', async update => { seen.push(update.message?.text ?? '') })])
    runtimes.push(runtime)
    await runtime.start()

    botMockHelper.feed(BotPlatform.Telegram, record, { text: 'via polling', chat: { kind: BotChatKind.Private } })
    await until(async () => seen.includes('via polling'))
    const methods = telegramBotPlatform.mock.calls(connection.id).map(call => call.method)
    expect(methods).toContain('deleteWebhook')
    expect(methods).toContain('getUpdates')
    expect((await bot.updates.list({ connection: connection.id })).items.map(row => row.status)).toEqual([BotInboxStatus.Done])

    await runtime.stop()
    expect(runtime.running).toBe(false)
    const callsAfterStop = telegramBotPlatform.mock.calls(connection.id).length
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(telegramBotPlatform.mock.calls(connection.id).length).toBe(callsAfterStop)
  })
})
