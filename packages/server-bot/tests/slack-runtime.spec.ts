import { afterEach, describe, expect, test } from 'bun:test'
import {
  BotActionKind, BotChatKind, BotConnectionStatus, BotPlatform, BotReceiveMode, BotTransport,
  BotUpdateKind, botTextHelper, type BotUpdate,
} from '@owlmeans/bot'
import { BotInboxStatus } from '../src/consts.js'
import { botHandler } from '../src/handler.js'
import { botMockHelper } from '../src/mock/index.js'
import { BOT_BUILTIN_PLATFORMS } from '../src/platforms/consts.js'
import { makeBotPlatformRegistry } from '../src/platforms/registry.js'
import { SLACK_RETRY_NUM_HEADER, SLACK_SIGNATURE_HEADER, SLACK_TIMESTAMP_HEADER } from '../src/platforms/slack/consts.js'
import { slackBotPlatform } from '../src/platforms/slack/plugin.js'
import { slackSignatureHelper } from '../src/platforms/slack/signature.js'
import type { BotMockCall } from '../src/platforms/types.js'
import type { BotRuntime } from '../src/types.js'
import { makeTestBot, scopeOf, type TestBot } from './context.js'

const runtimes: BotRuntime[] = []
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(async runtime => { await runtime.stop() }))
})

const ORIGIN = 'https://shop.example.com'

const connect = async (bot: TestBot, scope: string, credentials?: Record<string, string>) => {
  const saved = await bot.service.connections.save(scope, {
    platform: BotPlatform.Slack, label: 'Guard', transport: BotTransport.Mock, ...(credentials != null ? { credentials } : {}),
  }, ORIGIN)
  return await bot.service.connections.verify(scope, saved.id, ORIGIN)
}

const callsOf = (connection: string): BotMockCall[] => slackBotPlatform.mock.calls(connection)

describe('@owlmeans/server-bot — Slack through the service (mock transport)', () => {
  test('the registry lists Slack as implemented', () => {
    const entry = makeBotPlatformRegistry(BOT_BUILTIN_PLATFORMS).platforms().find(item => item.platform === BotPlatform.Slack)
    expect(entry?.implemented).toBe(true)
  })

  test('save → verify: the fake bot\'s identity, a webhook with manual setup naming the Request URL', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    const fake = slackBotPlatform.mock.identityOf(connection.id)

    expect(connection).toMatchObject({
      status: BotConnectionStatus.Connected, receive: BotReceiveMode.Webhook,
      identity: { id: fake.botUserId, username: fake.username, name: fake.teamName },
      hookUrl: `${ORIGIN}/api/bot/hook/slack/${connection.id}`,
    })
    expect(connection.setup?.some(step => step.endsWith(`${ORIGIN}/api/bot/hook/slack/${connection.id}`))).toBe(true)
    expect(callsOf(connection.id).map(call => call.method)).toEqual(['auth.test'])
  })

  test('a live connection without its credentials is refused at verify', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const saved = await bot.service.connections.save(scope, { platform: BotPlatform.Slack, label: 'Live' })
    await expect(bot.service.connections.verify(scope, saved.id)).rejects.toThrow('bot:credentials-rejected:missing:botToken,signingSecret')
    expect((await bot.service.connections.get(scope, saved.id)).status).toBe(BotConnectionStatus.Failed)
  })

  test('simulate → inbox → runtime: a handler replies in the thread and reacts; activity is recorded as mock', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    const fake = slackBotPlatform.mock.identityOf(connection.id)
    // The application's own keyword group with its warning, matched by the handler.
    const spam = { id: 'group-spam', keywords: ['casino'], warning: 'No casino links, please.' }
    const seen: BotUpdate[] = []
    const runtime = bot.service.runtime([botHandler('warn', async (update, actions) => {
      seen.push(update)
      if (botTextHelper.matched(update.message?.text ?? '', spam.keywords).length > 0) {
        expect((await actions.reply(update, spam.warning, { ref: spam.id })).ok).toBe(true)
        expect((await actions.react(update, ':no_entry_sign:', { ref: spam.id })).ok).toBe(true)
      }
      expect(actions.supports(BotActionKind.Mute)).toBe(false)
    })])
    runtimes.push(runtime)

    const { update } = await bot.service.simulate(scope, connection.id, {
      text: `@${fake.username} Best CASINO in town`, sender: { id: 'spammer', name: 'Spammer' },
    })
    expect(await runtime.dispatch()).toBe(1)

    const [message] = seen
    expect(message).toMatchObject({
      id: update, kind: BotUpdateKind.Message, addressed: true,
      chat: { kind: BotChatKind.Group, space: fake.teamId }, sender: { name: 'Spammer', bot: false },
    })
    expect(message.message?.text).toEndWith('Best CASINO in town')
    expect((await bot.updates.get(update)).status).toBe(BotInboxStatus.Done)

    const calls = callsOf(connection.id)
    expect(calls.find(call => call.method === 'chat.postMessage')?.params).toEqual({
      channel: message.chat.id, text: 'No casino links, please.', thread_ts: message.message!.ref.id,
    })
    expect(calls.find(call => call.method === 'reactions.add')?.params).toEqual({
      channel: message.chat.id, timestamp: message.message!.ref.id, name: 'no_entry_sign',
    })
    const activity = await bot.service.activity.list(scope)
    expect(activity.map(entry => [entry.action, entry.ok, entry.transport, entry.ref, entry.update])).toEqual([
      [BotActionKind.React, true, BotTransport.Mock, spam.id, update],
      [BotActionKind.Reply, true, BotTransport.Mock, spam.id, update],
    ])
  })

  test('a direct message is private and addressed; a thread reply under the bot\'s post is addressed', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    const actions = await bot.service.actions({ scope, connection: connection.id })
    const posted = await actions.send('C0MOCK00001', 'Welcome!')
    expect(posted.ok).toBe(true)

    const direct = await bot.service.simulate(scope, connection.id, { text: 'hello', chat: { kind: BotChatKind.Private } })
    const reply = await bot.service.simulate(scope, connection.id, { text: 'thanks', replyTo: { id: posted.message!.id } })
    const [first, second] = [(await bot.updates.get(direct.update)).update, (await bot.updates.get(reply.update)).update]
    expect([first.chat.kind, first.addressed, first.chat.id.startsWith('D')]).toEqual([BotChatKind.Private, true, true])
    expect([second.addressed, second.chat.thread, second.message?.replyTo?.id]).toEqual([true, posted.message!.id, posted.message!.id])
  })

  test('delete: refused without the admin userToken, done with it through the user token', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const plain = await connect(bot, scope)
    const runtimeUpdates: BotUpdate[] = []
    const runtime = bot.service.runtime([botHandler('collect', async update => { runtimeUpdates.push(update) })])
    runtimes.push(runtime)

    await bot.service.simulate(scope, plain.id, { text: 'casino' })
    await runtime.dispatch()
    const withoutToken = await bot.service.actions(runtimeUpdates[0])
    expect(withoutToken.supports(BotActionKind.Delete)).toBe(false)
    expect(await withoutToken.delete(runtimeUpdates[0])).toEqual({ ok: false, error: 'Slack can delete messages only with the userToken credential.', code: 'bot:unsupported-action:delete' })
    expect(callsOf(plain.id).some(call => call.method === 'chat.delete')).toBe(false)

    const admin = await connect(bot, scope, { userToken: 'xoxp-mock-admin' })
    expect(admin.credentialsSet).toEqual(['userToken'])
    expect(callsOf(admin.id).map(call => [call.method, call.auth])).toEqual([['auth.test', 'none'], ['auth.test', 'user']])
    await bot.service.simulate(scope, admin.id, { text: 'casino again' })
    await runtime.dispatch()
    const update = runtimeUpdates[1]
    const withToken = await bot.service.actions(update)
    expect(withToken.supports(BotActionKind.Delete)).toBe(true)
    expect(await withToken.delete(update)).toEqual({ ok: true })
    expect(callsOf(admin.id).find(call => call.method === 'chat.delete')).toMatchObject({
      auth: 'user', params: { channel: update.chat.id, ts: update.message!.ref.id },
    })
    const [deleted] = await bot.service.activity.list(scope, { connection: admin.id })
    expect([deleted.action, deleted.ok, deleted.transport]).toEqual([BotActionKind.Delete, true, BotTransport.Mock])
  })

  test('the hook path: a signed request is stored once — a retry and the app_mention twin are the same row', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    const record = await bot.connections.get(connection.id)
    const fake = slackBotPlatform.mock.identityOf(connection.id)

    const inbound = botMockHelper.inbound(BotPlatform.Slack, { text: `<@${fake.botUserId}> help` }, record)
    const request = { method: 'POST', headers: inbound.headers, body: inbound.body, rawBody: inbound.rawBody }
    const first = await bot.service.receive(BotPlatform.Slack, connection.id, request)
    const retry = await bot.service.receive(BotPlatform.Slack, connection.id, {
      ...request, headers: { ...request.headers, [SLACK_RETRY_NUM_HEADER]: '1' },
    })

    const native = inbound.body as { event: { channel: string, ts: string, user: string, text: string } }
    const mention = { ...(inbound.body as object), event_id: 'Ev-mention', event: {
      type: 'app_mention', user: native.event.user, text: native.event.text, ts: native.event.ts,
      channel: native.event.channel, event_ts: native.event.ts,
    } }
    const twinRaw = JSON.stringify(mention)
    const timestamp = `${Math.floor(Date.now() / 1000)}`
    const mentioned = await bot.service.receive(BotPlatform.Slack, connection.id, {
      method: 'POST', body: mention, rawBody: twinRaw,
      headers: {
        'content-type': 'application/json',
        [SLACK_TIMESTAMP_HEADER]: timestamp,
        [SLACK_SIGNATURE_HEADER]: slackSignatureHelper.sign(record.hookSecret, timestamp, twinRaw),
      },
    })

    expect(first.updates.length).toBe(1)
    expect([retry.updates, mentioned.updates]).toEqual([first.updates, first.updates])
    expect((await bot.updates.list({ connection: connection.id })).items.length).toBe(1)

    const forged = { ...request, headers: { ...request.headers, 'x-slack-signature': 'v0=00' } }
    await expect(bot.service.receive(BotPlatform.Slack, connection.id, forged)).rejects.toThrow('bot:signature-rejected:signature')
  })

  test('url_verification through the hook answers the challenge and stores nothing', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope, { signingSecret: 'mock-signing-secret' })
    const record = await bot.connections.get(connection.id)
    const opened = { ...connection, credentials: { signingSecret: 'mock-signing-secret' }, hookSecret: record.hookSecret }
    const handshake = slackBotPlatform.mock.challenge(opened, 'challenge-123')

    const answer = await bot.service.receive(BotPlatform.Slack, connection.id, {
      method: 'POST', headers: handshake.headers, body: handshake.body, rawBody: handshake.rawBody,
    })
    expect(answer).toEqual({ reply: { challenge: 'challenge-123' }, updates: [] })
    expect((await bot.updates.list({ connection: connection.id })).items).toEqual([])

    // A simulated message skips the hook (and its handshake): straight to normalize and the inbox.
    const { update } = await bot.service.simulate(scope, connection.id, { text: 'hi' })
    expect((await bot.updates.get(update)).update.message?.text).toBe('hi')
  })
})
