import { afterEach, describe, expect, test } from 'bun:test'
import {
  BotActionKind, BotChatKind, BotErrorPlatform, BotTransport, botTextHelper, type BotUpdate,
} from '@owlmeans/bot'
import { BotInboxStatus } from '../src/consts.js'
import { botHandler } from '../src/handler.js'
import { makeBotMockHelper } from '../src/mock/mock.js'
import { makeTestBotPlatform } from '../src/mock/platform.js'
import type { BotRuntime } from '../src/types.js'
import { makeTestBot, scopeOf, until, type TestBot } from './context.js'

const runtimes: BotRuntime[] = []
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(async runtime => { await runtime.stop() }))
})

const connect = async (bot: TestBot, scope: string, platform: string = 'test') => {
  const saved = await bot.service.connections.save(scope, { platform, label: 'Guard', transport: BotTransport.Mock })
  return await bot.service.connections.verify(scope, saved.id)
}

describe('@owlmeans/server-bot — runtime and actions', () => {
  test('simulate → inbox → a handler deletes and replies: activity recorded as mock, with its targets', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    // The application's own keyword group: the handler matches it, the service hands over the update as is.
    const spam = { id: 'group-spam', keywords: ['casino'] }
    const seen: BotUpdate[] = []
    const runtime = bot.service.runtime([botHandler('moderate', async (update, actions) => {
      seen.push(update)
      if (botTextHelper.matched(update.message?.text ?? '', spam.keywords).length > 0) {
        expect((await actions.delete(update, { ref: spam.id })).ok).toBe(true)
        const reply = await actions.reply(update, 'Removed: casino links are not allowed.', { ref: spam.id })
        expect(reply.ok).toBe(true)
        expect(reply.message?.chat).toBe(update.chat.id)
      }
    })])
    runtimes.push(runtime)

    const { update } = await bot.service.simulate(scope, connection.id, { text: 'Best CASINO in town', sender: { id: '777', name: 'Spammer' } })
    expect(await runtime.dispatch()).toBe(1)

    expect(seen.map(entry => [entry.id, entry.message?.text, entry.sender?.id])).toEqual([[update, 'Best CASINO in town', '777']])
    expect(Object.keys(seen[0])).not.toContain('matches')
    expect((await bot.updates.get(update)).status).toBe(BotInboxStatus.Done)
    const [message] = seen
    const activity = await bot.service.activity.list(scope)
    expect(activity.map(entry => [entry.action, entry.ok, entry.transport, entry.ref, entry.update, entry.target])).toEqual([
      [BotActionKind.Reply, true, BotTransport.Mock, spam.id, update, { chat: message.chat.id, message: message.message!.ref.id }],
      [BotActionKind.Delete, true, BotTransport.Mock, spam.id, update, { chat: message.chat.id, message: message.message!.ref.id }],
    ])
    const calls = bot.platform.mock.calls(connection.id)
    expect(calls.find(call => call.method === 'deleteMessage')?.params).toEqual({ chat: message.chat.id, id: message.message!.ref.id })
    expect(calls.find(call => call.method === 'sendMessage')?.params).toMatchObject({
      chat: message.chat.id, text: 'Removed: casino links are not allowed.', replyTo: message.message!.ref.id,
    })
  })

  test('mute, ban and react reach the platform; note makes no call', async () => {
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
    const before = Date.now()
    await bot.service.simulate(scope, connection.id, { text: 'rude', sender: { id: '424242001' } })
    await runtime.dispatch()

    const calls = bot.platform.mock.calls(connection.id)
    const mute = calls.find(call => call.method === 'muteMember')!.params
    expect(mute).toMatchObject({ user: '424242001' })
    expect(Date.parse(`${mute.until}`) - before).toBeGreaterThanOrEqual(3600_000)
    expect(calls.find(call => call.method === 'banMember')!.params).toMatchObject({ user: '424242001' })
    expect(calls.find(call => call.method === 'react')!.params).toMatchObject({ emoji: '👎' })
    expect(calls.map(call => call.method)).not.toContain('note')
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
    const shop = makeTestBotPlatform({ title: 'Shop chat', actions: [BotActionKind.Reply, BotActionKind.Send, BotActionKind.React] })
    const bot = makeTestBot({ platforms: [shop] })
    const scope = scopeOf()
    const saved = await bot.service.connections.save(scope, { platform: 'test', label: 'Shop', transport: BotTransport.Mock })
    const actions = await bot.service.actions({ scope, connection: saved.id })

    expect([actions.supports(BotActionKind.Reply), actions.supports(BotActionKind.Delete), actions.supports(BotActionKind.Note)])
      .toEqual([true, false, true])
    expect(actions.descriptor()?.title).toBe('Shop chat')
    const removed = await actions.delete({ chat: '15550001', id: 'm.1' })
    expect(removed).toEqual({ ok: false, error: 'Shop chat cannot delete messages.', code: 'bot:unsupported-action:delete' })
    const [activity] = await bot.service.activity.list(scope)
    expect(activity).toMatchObject({
      action: BotActionKind.Delete, ok: false, error: removed.error, code: 'bot:unsupported-action:delete', transport: BotTransport.Mock,
    })
    expect(shop.mock.calls(saved.id)).toEqual([])

    const nobody = await bot.service.actions({ scope, connection: 'missing' })
    expect(nobody.descriptor()).toBeNull()
    expect(await nobody.send('1', 'x')).toEqual({
      ok: false, error: 'The bot connection does not exist.', code: 'bot:connection-not-found:missing',
    })
    expect(await actions.reply({ chat: '15550001', id: 'm.1' }, '   ')).toEqual({
      ok: false, error: 'The text is empty.', code: 'bot:invalid-action:empty-text',
    })
    expect(await actions.mute({ chat: '15550001', user: '15550001' }, { minutes: 5 })).toMatchObject({
      ok: false, code: 'bot:unsupported-action:mute',
    })
  })

  test('a connection whose platform is no longer registered keeps its record: it notes, and every call is unsupported', async () => {
    const scope = scopeOf()
    const before = makeTestBot()
    const saved = await before.service.connections.save(scope, { platform: 'test', label: 'Gone', transport: BotTransport.Mock })
    const after = makeTestBot({ platforms: [makeTestBotPlatform({ platform: 'other' })] }, before.store)
    const actions = await after.service.actions({ scope, connection: saved.id })

    expect(await actions.send('1', 'x')).toEqual({
      ok: false, error: 'The platform cannot send messages.', code: 'bot:unsupported-action:send',
    })
    expect((await actions.note({
      id: 'u-1', connection: saved.id, scope, platform: 'test', kind: 'message', chat: { id: '1', kind: BotChatKind.Group },
      addressed: false, receivedAt: new Date().toISOString(),
    } as BotUpdate, 'Recorded')).ok).toBe(true)
  })

  test('a platform\'s refusal and a server-only action answer one short sentence; the marker stays in `code`', async () => {
    const bot = makeTestBot({
      platforms: [makeTestBotPlatform({ title: 'Acme' }), makeTestBotPlatform({ platform: 'guild', title: 'Guild', spaceActions: [BotActionKind.Mute] })],
      // The platform's API as a live connection reaches it, refusing the delete in its own words.
      fetch: async url => Response.json(url.endsWith('/deleteMessage')
        ? { ok: false, error: 'message to delete not found' }
        : { ok: true, result: true }, { status: url.endsWith('/deleteMessage') ? 400 : 200 }),
    })
    const scope = scopeOf()
    const live = await bot.service.connections.save(scope, { platform: 'test', label: 'Live', credentials: { token: '1:x' } })
    const acme = await bot.service.actions({ scope, connection: live.id })
    expect(await acme.delete({ chat: '-100', id: '7' })).toEqual({
      ok: false,
      error: 'Acme refused: message to delete not found.',
      code: 'bot:platform:test:400:message to delete not found',
    })

    const guild = await bot.service.connections.save(scope, { platform: 'guild', label: 'Guard', transport: BotTransport.Mock })
    const guard = await bot.service.actions({ scope, connection: guild.id })
    expect(await guard.mute({ chat: '1100000000000000002', user: '1100000000000000003' }, { minutes: 5 })).toEqual({
      ok: false,
      error: 'Guild can mute members only in a server, and this chat is in none.',
      code: 'bot:invalid-action:no-space:mute',
    })
    expect((await bot.service.activity.list(scope)).map(entry => [entry.action, entry.code])).toEqual([
      [BotActionKind.Mute, 'bot:invalid-action:no-space:mute'],
      [BotActionKind.Delete, 'bot:platform:test:400:message to delete not found'],
    ])
  })

  test('a platform that cannot be reached, or does not answer in time, is said so', async () => {
    const bot = makeTestBot({
      fetch: async url => {
        if (url.endsWith('/react')) {
          throw Object.assign(new Error('timed out'), { name: 'TimeoutError' })
        }
        throw new TypeError('fetch failed')
      },
    })
    const scope = scopeOf()
    const live = await bot.service.connections.save(scope, { platform: 'test', label: 'Live', credentials: { token: '1:x' } })
    const actions = await bot.service.actions({ scope, connection: live.id })

    expect(await actions.send('1', 'hello')).toEqual({
      ok: false, error: 'Test could not be reached.', code: 'bot:platform:test:503:sendMessage: unreachable',
    })
    expect(await actions.react({ chat: '1', id: '2' }, '👍')).toEqual({
      ok: false, error: 'Test did not answer in time.', code: 'bot:platform:test:504:react: timeout',
    })
  })

  test('a refusal carried by a plugin\'s own error class keeps the one wire type', async () => {
    class AcmeError extends BotErrorPlatform {
      constructor(message: string) {
        super(`test:${message}`)
      }
    }
    const plugin = makeTestBotPlatform()
    const bot = makeTestBot({ platforms: [{ ...plugin, act: async () => { throw new AcmeError('403:not an admin') } }] })
    const scope = scopeOf()
    const saved = await bot.service.connections.save(scope, { platform: 'test', label: 'Mock', transport: BotTransport.Mock })
    const result = await (await bot.service.actions({ scope, connection: saved.id })).ban({ chat: '1', user: '2' })

    expect(result).toEqual({ ok: false, error: 'Test refused: not an admin.', code: 'bot:platform:test:403:not an admin' })
    expect(new AcmeError('403:x').type).toBe(BotErrorPlatform.typeName)
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

    makeBotMockHelper([bot.platform]).feed('test', record, { text: 'via polling', chat: { kind: BotChatKind.Private } })
    await until(async () => seen.includes('via polling'))
    const methods = bot.platform.mock.calls(connection.id).map(call => call.method)
    expect(methods).toContain('deleteHook')
    expect(methods).toContain('updates')
    expect((await bot.updates.list({ connection: connection.id })).items.map(row => row.status)).toEqual([BotInboxStatus.Done])

    await runtime.stop()
    expect(runtime.running).toBe(false)
    const callsAfterStop = bot.platform.mock.calls(connection.id).length
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(bot.platform.mock.calls(connection.id).length).toBe(callsAfterStop)
  })
})
