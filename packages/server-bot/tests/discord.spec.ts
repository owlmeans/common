import { describe, expect, test } from 'bun:test'
import {
  BotActionKind, BotChatKind, BotConnectionStatus, BotPlatform, BotReceiveMode, BotTransport, BotUpdateKind,
  type BotConnection,
} from '@owlmeans/bot'
import { DISCORD_INVITE_PERMISSIONS, DISCORD_PERMISSIONS } from '../src/platforms/discord/consts.js'
import { DiscordApiError, DiscordGatewayError } from '../src/platforms/discord/errors.js'
import { discordBotPlatform, makeDiscordBotPlatform } from '../src/platforms/discord/plugin.js'
import { discordSetupHelper } from '../src/platforms/discord/setup.js'
import type { BotPlatformConnection } from '../src/platforms/types.js'

/** The bot as Get Current User answered it. */
const connection: BotConnection = {
  id: 'conn-d1', scope: 'org', platform: BotPlatform.Discord, label: 'Warden', transport: BotTransport.Live,
  status: BotConnectionStatus.Connected, enabled: true, receive: BotReceiveMode.Gateway,
  identity: { id: '900000000000000001', username: 'warden', name: 'Warden' }, credentialsSet: ['applicationId', 'token'],
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
}
const plugin = discordBotPlatform
const guild = '800000000000000001'
const channel = '800000000000000002'
const member = { id: '700000000000000001', username: 'annlee', global_name: 'Ann Lee', discriminator: '0', avatar: null }
const botUser = { id: '900000000000000001', username: 'warden', global_name: 'Warden', discriminator: '0', avatar: null, bot: true }

/** A gateway dispatch as Discord sends it (op 0, sequence, event name, the message). */
const dispatch = (t: string, d: Record<string, unknown>) => ({
  op: 0, s: 42, t,
  d: {
    channel_id: channel, guild_id: guild, author: member, member: { roles: [], joined_at: '2026-01-01T00:00:00.000000+00:00' },
    timestamp: '2026-10-26T12:00:00.123000+00:00', edited_timestamp: null, tts: false, mention_everyone: false,
    mentions: [], mention_roles: [], attachments: [], embeds: [], pinned: false, type: 0, ...d,
  },
})

const one = (payload: unknown) => {
  const updates = plugin.normalize(payload, connection)
  expect(updates.length).toBe(1)
  return updates[0]
}

describe('@owlmeans/server-bot — Discord normalization (gateway MESSAGE_CREATE / MESSAGE_UPDATE)', () => {
  test('a guild message: the channel is a group chat, the guild its space', () => {
    const { platformId, update } = one(dispatch('MESSAGE_CREATE', { id: '1300000000000000001', content: 'Free nitro at the casino' }))

    expect(platformId).toBe('1300000000000000001')
    expect(update).toMatchObject({
      kind: BotUpdateKind.Message,
      chat: { id: channel, kind: BotChatKind.Group, space: guild },
      sender: { id: member.id, name: 'Ann Lee', username: 'annlee', bot: false },
      message: {
        ref: { chat: channel, id: '1300000000000000001', space: guild },
        text: 'Free nitro at the casino',
        date: '2026-10-26T12:00:00.123Z',
      },
      addressed: false,
    })
    expect(update.command).toBeUndefined()
  })

  test('a direct message (no guild) is private and addressed; a command is parsed', () => {
    const direct = one(dispatch('MESSAGE_CREATE', { id: '1300000000000000002', guild_id: undefined, member: undefined, content: '/report spam above' })).update

    expect([direct.chat, direct.addressed]).toEqual([{ id: channel, kind: BotChatKind.Private }, true])
    expect([direct.kind, direct.command]).toEqual([BotUpdateKind.Command, { name: 'report', args: 'spam above' }])
    expect(direct.message?.ref.space).toBeUndefined()
  })

  test('a mention of the bot and a reply to it address it; the reply carries what it answers', () => {
    const mention = one(dispatch('MESSAGE_CREATE', { id: '1300000000000000003', content: 'hey <@900000000000000001> help', mentions: [botUser] })).update
    expect(mention.addressed).toBe(true)
    const legacy = one(dispatch('MESSAGE_CREATE', { id: '1300000000000000004', content: 'hey <@!900000000000000001>' })).update
    expect(legacy.addressed).toBe(true)

    const reply = one(dispatch('MESSAGE_CREATE', {
      id: '1300000000000000005', type: 19, content: 'why?',
      message_reference: { type: 0, message_id: '1300000000000000000', channel_id: channel, guild_id: guild },
      referenced_message: { id: '1300000000000000000', channel_id: channel, author: botUser, content: 'Message removed', timestamp: '2026-10-26T11:59:00.000000+00:00', edited_timestamp: null, type: 0 },
    })).update
    expect(reply.addressed).toBe(true)
    expect(reply.message?.replyTo).toEqual({
      chat: channel, id: '1300000000000000000', space: guild, text: 'Message removed',
      sender: { id: botUser.id, name: 'Warden', username: 'warden', bot: true },
    })

    const toMember = one(dispatch('MESSAGE_CREATE', {
      id: '1300000000000000006', type: 19, content: 'agreed',
      message_reference: { message_id: '1200000000000000000', channel_id: channel, guild_id: guild }, referenced_message: null,
    })).update
    expect([toMember.addressed, toMember.message?.replyTo]).toEqual([false, { chat: channel, id: '1200000000000000000', space: guild }])
  })

  test('an edit is `edited`, deduped by message id + edit time; an embed-only update is none', () => {
    const edited = one(dispatch('MESSAGE_UPDATE', {
      id: '1300000000000000007', content: 'now with casino', edited_timestamp: '2026-10-26T12:05:00.000000+00:00',
    }))
    expect(edited.platformId).toBe('1300000000000000007:2026-10-26T12:05:00.000000+00:00')
    expect([edited.update.kind, edited.update.message?.date]).toEqual([BotUpdateKind.Edited, '2026-10-26T12:05:00.000Z'])

    expect(plugin.normalize(dispatch('MESSAGE_UPDATE', { id: '1300000000000000007', content: 'x', embeds: [{}] }), connection)).toEqual([])
  })

  test('the bot\'s own message, system messages, other events and garbage normalize to nothing', () => {
    expect(plugin.normalize(dispatch('MESSAGE_CREATE', { id: '1', content: 'Removed.', author: botUser }), connection)).toEqual([])
    expect(plugin.normalize(dispatch('MESSAGE_CREATE', { id: '2', content: '', type: 7 }), connection)).toEqual([])
    expect(plugin.normalize({ op: 0, s: 1, t: 'GUILD_CREATE', d: { id: guild } }, connection)).toEqual([])
    expect(plugin.normalize({ op: 11, d: null }, connection)).toEqual([])
    expect(plugin.normalize(null, connection)).toEqual([])
  })
})

describe('@owlmeans/server-bot — Discord setup, hook, REST client and mock', () => {
  const platformConnection: BotPlatformConnection = {
    ...connection, credentials: { token: 'bot-token', applicationId: '900000000000000001' }, hookSecret: 'the-secret_1',
  }

  test('the invite URL asks for exactly the permissions the actions need', () => {
    expect(DISCORD_INVITE_PERMISSIONS).toBe('1374389611588')
    expect(DISCORD_PERMISSIONS.SendMessagesInThreads).toBe(1n << 38n)
    expect(BigInt(DISCORD_INVITE_PERMISSIONS)).toBe(Object.values(DISCORD_PERMISSIONS).reduce((all, bit) => all | bit, 0n))
    const url = new URL(discordSetupHelper.inviteUrl('900000000000000001'))
    expect([url.origin + url.pathname, url.searchParams.get('client_id'), url.searchParams.get('scope'), url.searchParams.get('permissions')])
      .toEqual(['https://discord.com/oauth2/authorize', '900000000000000001', 'bot', '1374389611588'])

    const steps = plugin.setup!(platformConnection)
    expect(steps[0]).toContain(discordSetupHelper.inviteUrl('900000000000000001'))
    expect(steps.join(' ')).toContain('MESSAGE CONTENT INTENT')
    expect(plugin.setup!({ ...platformConnection, credentials: {} })[0]).toContain('application id')
  })

  test('the hook route refuses everything, live or mock — even the mock\'s own frame', () => {
    const inbound = plugin.mock.inbound({ text: 'hello' }, { ...platformConnection, transport: BotTransport.Mock })
    const post = (transport: BotTransport, method = 'POST') => plugin.authenticate(
      { method, headers: { ...inbound.headers, 'x-owlmeans-bot-mock-signature': 'the-secret_1' }, body: inbound.body, rawBody: inbound.rawBody },
      { ...platformConnection, transport }
    )

    expect(post(BotTransport.Live)).toEqual({ result: 'reject', reason: 'gateway-only' })
    expect(post(BotTransport.Mock)).toEqual({ result: 'reject', reason: 'gateway-only' })
    expect(post(BotTransport.Mock, 'GET')).toEqual({ result: 'reject', reason: 'gateway-only' })
    expect(Object.keys(inbound.headers)).toEqual(['content-type'])
  })

  test('a fatal close code or a revoked token stops the receiver for good; other faults are retried', () => {
    for (const code of [4004, 4010, 4011, 4012, 4013, 4014]) {
      expect([code, plugin.fatal!(DiscordGatewayError.of(code, 'x'))]).toEqual([code, true])
    }
    expect(plugin.fatal!(DiscordApiError.of(401, '401: Unauthorized'))).toBe(true)
    expect(plugin.fatal!(DiscordGatewayError.of(0, 'unreachable'))).toBe(false)
    expect(plugin.fatal!(DiscordGatewayError.of(0, 'session-start-limit:1000'))).toBe(false)
    expect(plugin.fatal!(DiscordApiError.of(503, 'GET: unreachable'))).toBe(false)
    expect(plugin.fatal!(new Error('socket hang up'))).toBe(false)
  })

  test('calls go to `<base><route>` with `Authorization: Bot <token>`; 401 rejects the credentials', async () => {
    const seen: { url: string, method?: string, auth?: string, agent?: string }[] = []
    const proxied = makeDiscordBotPlatform({ base: 'https://discord-proxy.example.org/api/v10/' })
    const identity = await proxied.verify({
      connection: platformConnection,
      transport: BotTransport.Live,
      fetch: async (url, init) => {
        seen.push({ url, method: init?.method, auth: init?.headers?.authorization, agent: init?.headers?.['user-agent'] })
        return new Response(JSON.stringify(botUser))
      },
    })
    expect(seen).toEqual([{
      url: 'https://discord-proxy.example.org/api/v10/users/@me', method: 'GET', auth: 'Bot bot-token',
      agent: expect.stringMatching(/^DiscordBot \(/),
    }])
    expect(identity).toEqual({ id: botUser.id, username: 'warden', name: 'Warden' })

    await expect(plugin.verify({
      connection: platformConnection, transport: BotTransport.Live,
      fetch: async () => new Response(JSON.stringify({ message: '401: Unauthorized', code: 0 }), { status: 401 }),
    })).rejects.toThrow('bot:credentials-rejected:discord:401')
  })

  test('a 429 is waited out (bounded); a refusal keeps status and code without the token', async () => {
    let calls = 0
    const limited = await plugin.act({
      connection: platformConnection, transport: BotTransport.Live,
      fetch: async () => ++calls < 3
        ? new Response(JSON.stringify({ message: 'You are being rate limited.', retry_after: 0.01, global: false }), { status: 429 })
        : new Response(null, { status: 204 }),
    }, { kind: BotActionKind.Delete, message: { chat: channel, id: '1' } })
    expect([limited, calls]).toEqual([{}, 3])

    const forever = plugin.act({
      connection: platformConnection, transport: BotTransport.Live,
      fetch: async () => new Response(JSON.stringify({ message: 'You are being rate limited.', retry_after: 60, global: true }), { status: 429 }),
    }, { kind: BotActionKind.Delete, message: { chat: channel, id: '1' } })
    await expect(forever).rejects.toBeInstanceOf(DiscordApiError)
    await expect(forever).rejects.toMatchObject({ status: 429, retryAfter: 60 })

    const refused = await plugin.act({
      connection: platformConnection, transport: BotTransport.Live,
      fetch: async () => new Response(JSON.stringify({ message: 'Missing Permissions', code: 50013 }), { status: 403 }),
    }, { kind: BotActionKind.Ban, chat: channel, user: member.id, space: guild }).catch(error => error)
    expect(refused).toBeInstanceOf(DiscordApiError)
    expect([refused.message, refused.status, refused.code]).toEqual(['bot:discord:403:50013:Missing Permissions', 403, 50013])
    expect(refused.message).not.toContain('bot-token')
  })

  test('the mock answers like the API: a bot user, incrementing snowflakes, 204s, `{ code, message }` refusals', async () => {
    const mockConnection = { ...platformConnection, id: `mock-${Date.now()}`, transport: BotTransport.Mock }
    const fetch = plugin.mock.fetch(mockConnection)
    const send = async (body: object): Promise<Response> => await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, { method: 'POST', body: JSON.stringify(body) })

    const me: any = await (await fetch('https://discord.com/api/v10/users/@me')).json()
    expect(me).toMatchObject({ id: '900000000000000001', bot: true, discriminator: '0' })
    const first: any = await (await send({ content: 'one' })).json()
    const second: any = await (await send({ content: 'two', message_reference: { message_id: first.id } })).json()
    expect(BigInt(second.id) > BigInt(first.id)).toBe(true)
    expect([first.type, second.type, second.message_reference.message_id, first.author.id]).toEqual([0, 19, first.id, me.id])
    expect(BigInt(first.id) >> 22n).toBeGreaterThan(300_000_000_000n)

    const empty = await send({ content: '' })
    expect([empty.status, await empty.json()]).toEqual([400, { code: 50006, message: 'Cannot send an empty message' }])
    const removed = await fetch(`https://discord.com/api/v10/channels/${channel}/messages/${first.id}`, { method: 'DELETE' })
    expect(removed.status).toBe(204)
    expect((await fetch('https://discord.com/api/v10/nowhere')).status).toBe(404)
    expect(plugin.mock.calls(mockConnection.id).map(call => call.method))
      .toEqual(['getCurrentUser', 'createMessage', 'createMessage', 'createMessage', 'deleteMessage'])
  })
})
