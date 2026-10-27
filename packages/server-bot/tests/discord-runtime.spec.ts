import { afterEach, describe, expect, test } from 'bun:test'
import {
  BotActionKind, BotChatKind, BotConnectionStatus, BotPlatform, BotReceiveMode, BotRuleAction, BotSignatureRejected,
  BotTransport, type BotUpdate,
} from '@owlmeans/bot'
import { BotInboxStatus } from '../src/consts.js'
import { botHandler } from '../src/handler.js'
import { botMockHelper } from '../src/mock/index.js'
import { DISCORD_GATEWAY_INTENTS } from '../src/platforms/discord/consts.js'
import { discordBotPlatform } from '../src/platforms/discord/plugin.js'
import { discordSetupHelper } from '../src/platforms/discord/setup.js'
import type { BotRuntime } from '../src/types.js'
import { makeTestBot, scopeOf, until, type TestBot } from './context.js'

const runtimes: BotRuntime[] = []
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(async runtime => { await runtime.stop() }))
})

const APPLICATION_ID = '100000000000000001'

const connect = async (bot: TestBot, scope: string) => {
  const saved = await bot.service.connections.save(scope, {
    platform: BotPlatform.Discord, label: 'Warden', transport: BotTransport.Mock,
    credentials: { token: 'mock-token', applicationId: APPLICATION_ID },
  })
  return await bot.service.connections.verify(scope, saved.id)
}

describe('@owlmeans/server-bot — Discord on the mock transport', () => {
  test('save → verify (gateway, invite step) → simulate → dispatch: a handler deletes and replies, activity is mock', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    expect(connection).toMatchObject({
      status: BotConnectionStatus.Connected, receive: BotReceiveMode.Gateway,
      identity: { id: APPLICATION_ID, username: expect.stringMatching(/^mock_\w+_bot$/), name: 'Warden' },
    })
    expect(connection.setup?.[0]).toContain(discordSetupHelper.inviteUrl(APPLICATION_ID))

    const spam = await bot.service.rules.save(scope, { name: 'Spam', keywords: ['casino'], action: BotRuleAction.Delete })
    const seen: BotUpdate[] = []
    const runtime = bot.service.runtime([botHandler('moderate', async (update, actions) => {
      seen.push(update)
      for (const match of update.matches) {
        expect((await actions.delete(update, { rule: match.rule.id })).ok).toBe(true)
        const reply = await actions.reply(update, 'Removed: casino links are not allowed.', { rule: match.rule.id })
        expect(reply.ok).toBe(true)
        expect(reply.message).toMatchObject({ chat: update.chat.id, space: update.chat.space })
      }
    })])
    runtimes.push(runtime)

    const { update } = await bot.service.simulate(scope, connection.id, {
      text: 'Best CASINO in town', chat: { kind: BotChatKind.Group, title: 'E2E community' }, sender: { id: 'e2e-member-1', name: 'Spammer' },
    })
    // Simulate never takes the hook route: it refuses everything for Discord, the mock's own frame too.
    const frame = botMockHelper.inbound(BotPlatform.Discord, { text: 'via the hook' }, await bot.connections.get(connection.id))
    await expect(bot.service.receive(BotPlatform.Discord, connection.id, {
      method: 'POST', headers: frame.headers, body: frame.body, rawBody: frame.rawBody,
    })).rejects.toBeInstanceOf(BotSignatureRejected)
    expect(await runtime.dispatch()).toBe(1)

    const [message] = seen
    expect([message.id, message.matches.map(match => match.rule.id), message.chat.kind, message.sender?.name])
      .toEqual([update, [spam.id], BotChatKind.Group, 'Spammer'])
    expect(message.chat.space).toMatch(/^\d{17,20}$/)
    expect(message.sender?.id).toMatch(/^\d{17,20}$/)
    expect((await bot.updates.get(update)).status).toBe(BotInboxStatus.Done)
    const activity = await bot.service.activity.list(scope)
    expect(activity.map(entry => [entry.action, entry.ok, entry.transport, entry.rule, entry.update])).toEqual([
      [BotActionKind.Reply, true, BotTransport.Mock, spam.id, update],
      [BotActionKind.Delete, true, BotTransport.Mock, spam.id, update],
    ])
    const calls = discordBotPlatform.mock.calls(connection.id)
    expect(calls.find(call => call.method === 'deleteMessage')?.params).toEqual({
      channel_id: message.chat.id, message_id: message.message!.ref.id,
    })
    expect(calls.find(call => call.method === 'createMessage')?.params).toMatchObject({
      channel_id: message.chat.id, content: 'Removed: casino links are not allowed.',
      message_reference: { message_id: message.message!.ref.id, guild_id: message.chat.space, fail_if_not_exists: false },
      allowed_mentions: { parse: ['users'], replied_user: true },
    })
  })

  test('timeout and ban need the guild; react encodes the emoji; a direct message has no guild → ok:false', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    const results: Record<string, unknown> = {}
    const runtime = bot.service.runtime([botHandler('punish', async (update, actions) => {
      if (update.chat.kind === BotChatKind.Private) {
        results.dmMute = await actions.mute(update, { minutes: 60 })
        results.dmBan = await actions.ban(update)
        return
      }
      results.mute = await actions.mute(update, { minutes: 60 })
      results.long = await actions.mute({ chat: update.chat, user: update.sender!.id }, { minutes: 60 * 24 * 40 })
      results.ban = await actions.ban({ chat: update.chat.id, user: update.sender!.id, space: update.chat.space })
      results.react = await actions.react(update, '👎')
    })])
    runtimes.push(runtime)
    const before = Date.now()
    await bot.service.simulate(scope, connection.id, { text: 'rude', chat: { kind: BotChatKind.Group, space: '800000000000000001' } })
    await bot.service.simulate(scope, connection.id, { text: 'rude in private', chat: { kind: BotChatKind.Private } })
    expect(await runtime.dispatch()).toBe(2)

    expect([results.mute, results.long, results.ban, results.react]).toEqual([{ ok: true }, { ok: true }, { ok: true }, { ok: true }])
    expect(results.dmMute).toEqual({
      ok: false, error: 'Discord can mute members only in a server, and this chat is in none.', code: 'bot:invalid-action:no-guild:mute',
    })
    expect(results.dmBan).toEqual({
      ok: false, error: 'Discord can ban members only in a server, and this chat is in none.', code: 'bot:invalid-action:no-guild:ban',
    })

    const calls = discordBotPlatform.mock.calls(connection.id)
    const timeouts = calls.filter(call => call.method === 'modifyGuildMember').map(call => call.params)
    expect(timeouts.map(params => params.guild_id)).toEqual(['800000000000000001', '800000000000000001'])
    const [hour, capped] = timeouts.map(params => Date.parse(String(params.communication_disabled_until)) - before)
    expect(hour).toBeGreaterThanOrEqual(3_600_000 - 1_000)
    expect(capped).toBeLessThanOrEqual(28 * 24 * 3_600_000)
    expect(calls.find(call => call.method === 'createGuildBan')?.params).toMatchObject({ guild_id: '800000000000000001' })
    expect(calls.find(call => call.method === 'createReaction')?.params).toMatchObject({ emoji: '👎' })
    const failed = (await bot.service.activity.list(scope)).filter(entry => !entry.ok).map(entry => entry.action)
    expect(failed.sort()).toEqual([BotActionKind.Ban, BotActionKind.Mute])
  })

  test('a mention of the bot and a reply to its message are addressed in a simulated group', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    const seen: BotUpdate[] = []
    let answered: string | undefined
    const runtime = bot.service.runtime([botHandler('answer', async (update, actions) => {
      seen.push(update)
      if (update.message?.text === 'first') {
        answered = (await actions.reply(update, 'Hello from the bot')).message?.id
      }
    })])
    runtimes.push(runtime)

    await bot.service.simulate(scope, connection.id, { text: 'first' })
    await bot.service.simulate(scope, connection.id, { text: `hey @${connection.identity!.username} help` })
    await runtime.dispatch()
    expect(answered).toMatch(/^\d{17,20}$/)
    await bot.service.simulate(scope, connection.id, { text: 'why?', replyTo: { id: answered!, text: 'Hello from the bot' } })
    await runtime.dispatch()

    expect(seen.map(update => update.addressed)).toEqual([false, true, true])
    expect(seen[1].message?.text).toBe(`hey <@${APPLICATION_ID}> help`)
    expect(seen[2].message?.replyTo).toMatchObject({ id: answered, text: 'Hello from the bot', sender: { id: APPLICATION_ID, bot: true } })
  })

  test('the gateway receiver identifies on the fake gateway and drains the mock feed into the inbox; stop() closes it', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    const record = await bot.connections.get(connection.id)
    const seen: string[] = []
    const runtime = bot.service.runtime([botHandler('echo', async update => { seen.push(update.message?.text ?? '') })])
    runtimes.push(runtime)
    await runtime.start()

    botMockHelper.feed(BotPlatform.Discord, record, { text: 'via the gateway' })
    await until(async () => seen.includes('via the gateway'))
    botMockHelper.feed(BotPlatform.Discord, record, { text: 'in private', chat: { kind: BotChatKind.Private } })
    await until(async () => seen.includes('in private'))

    const calls = discordBotPlatform.mock.calls(connection.id)
    expect(calls.map(call => call.method)).toEqual(expect.arrayContaining(['getGatewayBot', 'gateway:connect', 'gateway:identify']))
    expect(String(calls.find(call => call.method === 'gateway:connect')?.params.url)).toContain('?v=10&encoding=json')
    expect(calls.find(call => call.method === 'gateway:identify')?.params).toMatchObject({ intents: DISCORD_GATEWAY_INTENTS })
    expect(calls.find(call => call.method === 'gateway:identify')?.params.token).toBeUndefined()
    expect((await bot.updates.list({ connection: connection.id })).items.map(row => row.status))
      .toEqual([BotInboxStatus.Done, BotInboxStatus.Done])

    await runtime.stop()
    const callsAfterStop = discordBotPlatform.mock.calls(connection.id).length
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(discordBotPlatform.mock.calls(connection.id).length).toBe(callsAfterStop)
  })
})
