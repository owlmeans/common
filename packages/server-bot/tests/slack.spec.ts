import { describe, expect, test } from 'bun:test'
import {
  BotActionKind, BotChatKind, BotConnectionStatus, BotPlatform, BotReceiveMode, BotTransport, BotUpdateKind,
  type BotConnection,
} from '@owlmeans/bot'
import { SLACK_SIGNATURE_HEADER, SLACK_TIMESTAMP_HEADER } from '../src/platforms/slack/consts.js'
import { SlackApiError } from '../src/platforms/slack/errors.js'
import { makeSlackBotPlatform, slackBotPlatform } from '../src/platforms/slack/plugin.js'
import { slackSignatureHelper } from '../src/platforms/slack/signature.js'
import type { BotFetch, BotPlatformConnection, BotPlatformSession } from '../src/platforms/types.js'

const BOT = 'U0BOT00001'
const APP = 'A0APP00001'
const TEAM = 'T0TEAM0001'
const SECRET = '8f742231b10e8888abcd99yyyzzz85a5'

/** The bot as `auth.test` answered it. */
const connection: BotConnection = {
  id: 'slack-1', scope: 'org', platform: BotPlatform.Slack, label: 'Guard', transport: BotTransport.Live,
  status: BotConnectionStatus.Connected, enabled: true, receive: BotReceiveMode.Webhook,
  identity: { id: BOT, username: 'guard', name: 'Owl lovers' }, credentialsSet: ['botToken', 'signingSecret'],
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
}
const plugin = slackBotPlatform

/** An Events API `event_callback` around one event (https://docs.slack.dev/apis/events-api/). */
const envelope = (event: Record<string, unknown>, eventId: string = 'Ev0001') => ({
  token: 'legacy', team_id: TEAM, api_app_id: APP, event, type: 'event_callback', event_id: eventId,
  event_time: 1761480000,
  authorizations: [{ enterprise_id: null, team_id: TEAM, user_id: BOT, is_bot: true, is_enterprise_install: false }],
})

const message = (fields: Record<string, unknown>) => ({
  type: 'message', channel: 'C0GENERAL1', channel_type: 'channel', user: 'U0ANN00001', team: TEAM,
  text: 'Free money at the casino', ts: '1761480000.000100', event_ts: '1761480000.000100', ...fields,
})

const one = (payload: unknown) => {
  const updates = plugin.normalize(payload, connection)
  expect(updates.length).toBe(1)
  return updates[0]
}

describe('@owlmeans/server-bot — Slack normalization (Events API shapes)', () => {
  test('a channel message', () => {
    const { platformId, update } = one(envelope(message({})))

    expect(platformId).toBe('C0GENERAL1:1761480000.000100')
    expect(update).toMatchObject({
      kind: BotUpdateKind.Message,
      chat: { id: 'C0GENERAL1', kind: BotChatKind.Group, space: TEAM },
      sender: { id: 'U0ANN00001', bot: false },
      message: {
        ref: { chat: 'C0GENERAL1', id: '1761480000.000100', space: TEAM },
        text: 'Free money at the casino',
        date: '2025-10-26T12:00:00.000Z',
      },
      addressed: false,
    })
    expect([update.chat.thread, update.message?.replyTo, update.command]).toEqual([undefined, undefined, undefined])
  })

  test('a thread reply carries its thread and the parent; a reply under the bot\'s post addresses it', () => {
    const reply = one(envelope(message({
      ts: '1761480100.000200', thread_ts: '1761480000.000100', parent_user_id: 'U0BOB00001', text: 'me too',
    }))).update
    expect([reply.chat.thread, reply.message?.ref.thread, reply.addressed]).toEqual(['1761480000.000100', '1761480000.000100', false])
    expect(reply.message?.replyTo).toEqual({
      chat: 'C0GENERAL1', id: '1761480000.000100', thread: '1761480000.000100', space: TEAM, sender: { id: 'U0BOB00001' },
    })

    const underBot = one(envelope(message({ ts: '1761480200.000300', thread_ts: '1761480000.000100', parent_user_id: BOT, text: 'why?' }))).update
    expect(underBot.addressed).toBe(true)
    expect(underBot.message?.replyTo?.sender).toEqual({ id: BOT, bot: true })

    // The parent itself (thread_ts === ts) is no reply.
    const parent = one(envelope(message({ thread_ts: '1761480000.000100' }))).update
    expect([parent.chat.thread, parent.message?.replyTo]).toEqual(['1761480000.000100', undefined])
  })

  test('a direct message is private and addressed; a private channel and a group DM are groups', () => {
    const direct = one(envelope(message({ channel: 'D0DIRECT01', channel_type: 'im', text: 'hi' }))).update
    expect([direct.chat.kind, direct.addressed]).toEqual([BotChatKind.Private, true])
    expect(one(envelope(message({ channel: 'G0PRIVATE1', channel_type: 'group' }))).update.chat.kind).toBe(BotChatKind.Group)
    expect(one(envelope(message({ channel: 'G0MPIM0001', channel_type: 'mpim' }))).update.chat.kind).toBe(BotChatKind.Group)
  })

  test('app_mention is addressed and keyed like its message event — the pair stores once', () => {
    const text = `<@${BOT}> is this allowed?`
    const mention = one(envelope({
      type: 'app_mention', user: 'U0ANN00001', text, ts: '1761480300.000400', channel: 'C0GENERAL1', event_ts: '1761480300.000400',
    }, 'Ev0002'))
    const twin = one(envelope(message({ text, ts: '1761480300.000400' }), 'Ev0003'))

    expect([mention.update.kind, mention.update.addressed, mention.update.chat.kind]).toEqual([BotUpdateKind.Message, true, BotChatKind.Group])
    expect([twin.update.addressed, twin.platformId]).toEqual([true, mention.platformId])
    // The legacy `<@U…|name>` form addresses too; another user's mention does not.
    expect(one(envelope(message({ text: `hey <@${BOT}|guard>` }))).update.addressed).toBe(true)
    expect(one(envelope(message({ text: 'hey <@U0OTHER001>' }))).update.addressed).toBe(false)
  })

  test('escaped text is decoded for people and handlers; the mention is read from the escaped form', () => {
    const update = one(envelope(message({ text: `<@${BOT}> AT&amp;T says &lt;b&gt; &amp;lt;` }))).update
    expect([update.message?.text, update.addressed]).toEqual([`<@${BOT}> AT&T says <b> &lt;`, true])
    // A decoded `<@BOT>` that a person typed literally is no mention.
    expect(one(envelope(message({ text: `&lt;@${BOT}&gt;` }))).update.addressed).toBe(false)
  })

  test('a /command in the text is a command', () => {
    const command = one(envelope(message({ text: '/report spam above' }))).update
    expect([command.kind, command.command]).toEqual([BotUpdateKind.Command, { name: 'report', args: 'spam above' }])
  })

  test('an edit with new text is `edited`, keyed by the edit; metadata-only changes are ignored', () => {
    const edited = one(envelope({
      type: 'message', subtype: 'message_changed', hidden: true, channel: 'C0GENERAL1', channel_type: 'channel',
      ts: '1761480500.000600', event_ts: '1761480500.000600',
      message: {
        type: 'message', user: 'U0ANN00001', text: 'now with casino', ts: '1761480000.000100',
        edited: { user: 'U0ANN00001', ts: '1761480500.000000' },
      },
      previous_message: { type: 'message', user: 'U0ANN00001', text: 'hello', ts: '1761480000.000100' },
    }))
    expect(edited.platformId).toBe('C0GENERAL1:1761480000.000100:edited:1761480500.000000')
    expect(edited.update).toMatchObject({
      kind: BotUpdateKind.Edited,
      message: { ref: { id: '1761480000.000100' }, text: 'now with casino', date: '2025-10-26T12:08:20.000Z' },
      sender: { id: 'U0ANN00001' },
    })

    expect(plugin.normalize(envelope({
      type: 'message', subtype: 'message_changed', channel: 'C0GENERAL1', ts: '1761480600.000700',
      message: { type: 'message', user: 'U0ANN00001', text: 'hello', ts: '1761480000.000100', attachments: [{}] },
      previous_message: { type: 'message', user: 'U0ANN00001', text: 'hello', ts: '1761480000.000100' },
    }), connection)).toEqual([])
  })

  test('system subtypes, bot_message, the bot\'s own posts and other payloads normalize to nothing', () => {
    for (const subtype of ['bot_message', 'message_deleted', 'channel_join', 'channel_topic']) {
      expect(plugin.normalize(envelope(message({ subtype })), connection)).toEqual([])
    }
    expect(plugin.normalize(envelope(message({ user: BOT, bot_id: 'B0BOT00001' })), connection)).toEqual([])
    expect(plugin.normalize(envelope(message({ user: 'U0OTHERBOT', bot_id: 'B0BOT00001', app_id: APP })), connection)).toEqual([])
    expect(plugin.normalize({ token: 'x', challenge: 'c', type: 'url_verification' }, connection)).toEqual([])
    expect(plugin.normalize({ type: 'app_rate_limited', minute_rate_limited: 1 }, connection)).toEqual([])
    expect(plugin.normalize(envelope({ type: 'reaction_added', user: 'U1' }), connection)).toEqual([])
    expect(plugin.normalize(null, connection)).toEqual([])

    // Another app's bot is a member like any other — flagged as a bot.
    const other = one(envelope(message({ user: 'U0OTHERBOT', bot_id: 'B0OTHER001', app_id: 'A0OTHER001', bot_profile: { name: 'Feeds' } }))).update
    expect(other.sender).toEqual({ id: 'U0OTHERBOT', name: 'Feeds', bot: true })
  })

  test('the bot\'s own posts are recognized from the installation before verification', () => {
    const unverified: BotConnection = { ...connection, identity: undefined }
    expect(plugin.normalize(envelope(message({ user: BOT })), unverified)).toEqual([])
    expect(plugin.normalize(envelope(message({ text: `<@${BOT}> hi` })), unverified)[0].update.addressed).toBe(true)
  })
})

describe('@owlmeans/server-bot — Slack request signing', () => {
  const platformConnection: BotPlatformConnection = {
    ...connection, credentials: { botToken: 'xoxb-1', signingSecret: SECRET }, hookSecret: 'hook-secret-1',
  }
  const now = (): string => `${Math.floor(Date.now() / 1000)}`
  const signedRequest = (rawBody: string, opts: { secret?: string, timestamp?: string, method?: string } = {}) => {
    const timestamp = opts.timestamp ?? now()
    return {
      method: opts.method ?? 'POST',
      headers: {
        'X-Slack-Request-Timestamp': timestamp,
        'X-Slack-Signature': slackSignatureHelper.sign(opts.secret ?? SECRET, timestamp, rawBody),
      },
      body: JSON.parse(rawBody),
      rawBody,
    }
  }
  const raw = JSON.stringify(envelope(message({})))

  test('the documented example signs to the documented signature', () => {
    // https://docs.slack.dev/authentication/verifying-requests-from-slack — the worked example.
    const body = 'token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c'
    expect(slackSignatureHelper.sign('8f742231b10e8888abcd99yyyzzz85a5', '1531420618', body))
      .toBe('v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503')
  })

  test('a fresh signature over the raw body is accepted, header names in any case', () => {
    expect(plugin.authenticate(signedRequest(raw), platformConnection)).toEqual({ result: 'ok' })
    const lower = signedRequest(raw)
    const headers = { [SLACK_TIMESTAMP_HEADER]: lower.headers['X-Slack-Request-Timestamp'], [SLACK_SIGNATURE_HEADER]: lower.headers['X-Slack-Signature'] }
    expect(plugin.authenticate({ ...lower, headers }, platformConnection)).toEqual({ result: 'ok' })
  })

  test('another secret, a tampered body, a stale or future timestamp, a GET and no headers are rejected', () => {
    const reject = (reason: string) => ({ result: 'reject' as const, reason })
    expect(plugin.authenticate(signedRequest(raw, { secret: 'another-secret' }), platformConnection)).toEqual(reject('signature'))
    const tampered = { ...signedRequest(raw), rawBody: raw.replace('casino', 'CASINO') }
    expect(plugin.authenticate(tampered, platformConnection)).toEqual(reject('signature'))
    const stale = `${Math.floor(Date.now() / 1000) - 301}`
    expect(plugin.authenticate(signedRequest(raw, { timestamp: stale }), platformConnection)).toEqual(reject('stale-timestamp'))
    const future = `${Math.floor(Date.now() / 1000) + 301}`
    expect(plugin.authenticate(signedRequest(raw, { timestamp: future }), platformConnection)).toEqual(reject('stale-timestamp'))
    expect(plugin.authenticate(signedRequest(raw, { method: 'GET' }), platformConnection)).toEqual(reject('method'))
    expect(plugin.authenticate({ method: 'POST', headers: {}, rawBody: raw }, platformConnection)).toEqual(reject('stale-timestamp'))
  })

  test('a live connection never falls back to the hook secret; a mock one accepts it', () => {
    const live: BotPlatformConnection = { ...platformConnection, credentials: { botToken: 'xoxb-1' } }
    expect(plugin.authenticate(signedRequest(raw, { secret: live.hookSecret }), live))
      .toEqual({ result: 'reject', reason: 'no-signing-secret' })
    const mock: BotPlatformConnection = { ...live, transport: BotTransport.Mock }
    expect(plugin.authenticate(signedRequest(raw, { secret: mock.hookSecret }), mock)).toEqual({ result: 'ok' })
  })

  test('url_verification is answered with its challenge only when signed', () => {
    const handshake = JSON.stringify({ token: 'legacy', challenge: '3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P', type: 'url_verification' })
    expect(plugin.authenticate(signedRequest(handshake), platformConnection)).toEqual({
      result: 'challenge', reply: { challenge: '3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P' },
    })
    expect(plugin.authenticate(signedRequest(handshake, { secret: 'forged' }), platformConnection))
      .toEqual({ result: 'reject', reason: 'signature' })
  })
})

describe('@owlmeans/server-bot — Slack Web API client', () => {
  const credentials = { botToken: 'xoxb-bot', signingSecret: SECRET }
  const sessionOf = (fetch: BotFetch, extra: Record<string, string> = {}): BotPlatformSession => ({
    connection: { ...connection, credentials: { ...credentials, ...extra }, hookSecret: 'h' },
    transport: BotTransport.Live,
    fetch,
  })
  const json = (body: unknown, init: ResponseInit = {}): Response => new Response(JSON.stringify(body), init)
  const bot = { ok: true, url: 'https://owls.slack.com/', team: 'Owl lovers', user: 'guard', team_id: TEAM, user_id: BOT, bot_id: 'B0BOT00001' }

  test('calls go to `<base>/<method>` with a bearer token and JSON — the base is overridable', async () => {
    const seen: { url: string, headers?: Record<string, string>, body?: string }[] = []
    const proxied = makeSlackBotPlatform({ base: 'https://slack.example.org/api/' })
    const identity = await proxied.verify(sessionOf(async (url, init) => {
      seen.push({ url, headers: init?.headers, body: init?.body })
      return json(bot)
    }))

    expect(seen).toEqual([{
      url: 'https://slack.example.org/api/auth.test',
      headers: { 'content-type': 'application/json; charset=utf-8', authorization: 'Bearer xoxb-bot' },
      body: '{}',
    }])
    expect(identity).toEqual({ id: BOT, username: 'guard', name: 'Owl lovers' })
  })

  test('verify: a refused token, a user token as the bot\'s, a foreign admin token are credential refusals', async () => {
    await expect(plugin.verify(sessionOf(async () => json({ ok: false, error: 'invalid_auth' }))))
      .rejects.toThrow('bot:credentials-rejected:slack:invalid_auth')
    await expect(plugin.verify(sessionOf(async () => json({ ...bot, bot_id: undefined }))))
      .rejects.toThrow('bot:credentials-rejected:slack:botToken-not-a-bot-token')
    await expect(plugin.verify({ ...sessionOf(async () => json(bot)), connection: { ...sessionOf(async () => json(bot)).connection, credentials: {} } }))
      .rejects.toThrow('bot:credentials-rejected:missing:botToken,signingSecret')

    const admin = (answer: object): BotFetch => async (_url, init) =>
      init?.headers?.authorization === 'Bearer xoxp-admin' ? json(answer) : json(bot)
    await expect(plugin.verify(sessionOf(admin({ ok: false, error: 'token_revoked' }), { userToken: 'xoxp-admin' })))
      .rejects.toThrow('bot:credentials-rejected:slack:userToken:token_revoked')
    await expect(plugin.verify(sessionOf(admin(bot), { userToken: 'xoxp-admin' })))
      .rejects.toThrow('bot:credentials-rejected:slack:userToken-not-a-user-token')
    await expect(plugin.verify(sessionOf(admin({ ...bot, user_id: 'U0ADMIN001', bot_id: undefined, team_id: 'T0ELSEWHERE' }), { userToken: 'xoxp-admin' })))
      .rejects.toThrow('bot:credentials-rejected:slack:userToken-another-workspace')
    expect(await plugin.verify(sessionOf(admin({ ...bot, user: 'admin', user_id: 'U0ADMIN001', bot_id: undefined }), { userToken: 'xoxp-admin' })))
      .toEqual({ id: BOT, username: 'guard', name: 'Owl lovers' })
  })

  test('ok:false is a SlackApiError with method and code; a fault never carries the token', async () => {
    const error = await plugin.act(sessionOf(async () => json({ ok: false, error: 'not_in_channel' })), {
      kind: BotActionKind.Send, chat: { id: 'C1', kind: BotChatKind.Group }, text: 'x',
    }).catch(failure => failure)
    expect(error).toBeInstanceOf(SlackApiError)
    expect([error.message, error.method, error.code]).toEqual(['bot:slack:chat.postMessage:not_in_channel', 'chat.postMessage', 'not_in_channel'])

    const fault = await plugin.act(sessionOf(async () => { throw new Error('connect ECONNREFUSED xoxb-bot') }), {
      kind: BotActionKind.Send, chat: { id: 'C1', kind: BotChatKind.Group }, text: 'x',
    }).catch(failure => failure)
    expect(fault.message).toBe('bot:slack:chat.postMessage:unreachable')
  })

  test('a 429 is retried after its Retry-After, a bounded number of times', async () => {
    let calls = 0
    const flaky: BotFetch = async () => ++calls === 1
      ? new Response('', { status: 429, headers: { 'retry-after': '0' } })
      : json({ ok: true, channel: 'C1', ts: '1761480000.000900' })
    const done = await plugin.act(sessionOf(flaky), { kind: BotActionKind.Send, chat: { id: 'C1', kind: BotChatKind.Group }, text: 'x' })
    expect([calls, done.message?.id]).toEqual([2, '1761480000.000900'])

    let limited = 0
    const always: BotFetch = async () => { limited++; return new Response('', { status: 429, headers: { 'retry-after': '0' } }) }
    const refused = await plugin.act(sessionOf(always), {
      kind: BotActionKind.React, message: { chat: 'C1', id: '1.000001' }, emoji: 'eyes',
    }).catch(failure => failure)
    expect([limited, refused.message]).toEqual([3, 'bot:slack:reactions.add:ratelimited'])

    // A wait longer than the bound is not waited for.
    let long = 0
    const patient = makeSlackBotPlatform({ maxRetryWaitS: 5 })
    const slow: BotFetch = async () => { long++; return new Response('', { status: 429, headers: { 'retry-after': '60' } }) }
    const tooLong = await patient.act(sessionOf(slow), { kind: BotActionKind.React, message: { chat: 'C1', id: '1.000001' }, emoji: 'eyes' })
      .catch(failure => failure)
    expect([long, tooLong.retryAfter]).toEqual([1, 60])
  })

  test('act: reply in the thread, send, delete with the user token, react by name; mute and ban are refused', async () => {
    const seen: { method: string, auth?: string, body: Record<string, unknown> }[] = []
    const fetch: BotFetch = async (url, init) => {
      seen.push({ method: url.split('/').pop()!, auth: init?.headers?.authorization, body: JSON.parse(init?.body ?? '{}') })
      return json({ ok: true, channel: 'C1', ts: '1761480999.000001' })
    }
    const session = sessionOf(fetch, { userToken: 'xoxp-admin' })
    const reply = await plugin.act(session, { kind: BotActionKind.Reply, to: { chat: 'C1', id: '1761480000.000100', space: TEAM }, text: 'Please keep to the rules.' })
    const inThread = await plugin.act(session, { kind: BotActionKind.Reply, to: { chat: 'C1', id: '1761480100.000200', thread: '1761480000.000100' }, text: 'ok' })
    await plugin.act(session, { kind: BotActionKind.Send, chat: { id: 'C1', kind: BotChatKind.Group }, text: 'Hello' })
    await plugin.act(session, { kind: BotActionKind.Delete, message: { chat: 'C1', id: '1761480000.000100' } })
    await plugin.act(session, { kind: BotActionKind.React, message: { chat: 'C1', id: '1761480000.000100' }, emoji: ':eyes:' })
    await plugin.act(session, { kind: BotActionKind.React, message: { chat: 'C1', id: '1761480000.000100' }, emoji: '👎' })
    await plugin.act(session, { kind: BotActionKind.React, message: { chat: 'C1', id: '1761480000.000100' }, emoji: '⚠️' })

    expect(reply.message).toEqual({ chat: 'C1', id: '1761480999.000001', thread: '1761480000.000100', space: TEAM })
    expect(inThread.message?.thread).toBe('1761480000.000100')
    expect(seen).toEqual([
      { method: 'chat.postMessage', auth: 'Bearer xoxb-bot', body: { channel: 'C1', text: 'Please keep to the rules.', thread_ts: '1761480000.000100' } },
      { method: 'chat.postMessage', auth: 'Bearer xoxb-bot', body: { channel: 'C1', text: 'ok', thread_ts: '1761480000.000100' } },
      { method: 'chat.postMessage', auth: 'Bearer xoxb-bot', body: { channel: 'C1', text: 'Hello' } },
      { method: 'chat.delete', auth: 'Bearer xoxp-admin', body: { channel: 'C1', ts: '1761480000.000100' } },
      { method: 'reactions.add', auth: 'Bearer xoxb-bot', body: { channel: 'C1', timestamp: '1761480000.000100', name: 'eyes' } },
      { method: 'reactions.add', auth: 'Bearer xoxb-bot', body: { channel: 'C1', timestamp: '1761480000.000100', name: '-1' } },
      { method: 'reactions.add', auth: 'Bearer xoxb-bot', body: { channel: 'C1', timestamp: '1761480000.000100', name: 'warning' } },
    ])

    seen.length = 0
    await plugin.act(session, { kind: BotActionKind.Send, chat: { id: 'C1', kind: BotChatKind.Group }, text: 'a < b & <@U1>' })
    expect(seen[0].body.text).toBe('a &lt; b &amp; &lt;@U1&gt;')

    await expect(plugin.act(sessionOf(fetch), { kind: BotActionKind.Delete, message: { chat: 'C1', id: '1.000001' } }))
      .rejects.toThrow('bot:unsupported-action:delete')
    await expect(plugin.act(session, { kind: BotActionKind.Mute, chat: 'C1', user: 'U1', until: new Date() }))
      .rejects.toThrow('bot:unsupported-action:mute')
    await expect(plugin.act(session, { kind: BotActionKind.Ban, chat: 'C1', user: 'U1' }))
      .rejects.toThrow('bot:unsupported-action:ban')
  })

  test('setup names the Request URL, the events and the scopes', () => {
    const steps = plugin.setup!({ ...connection, hookUrl: 'https://shop.example.com/api/bot/hook/slack/slack-1', credentials: {}, hookSecret: 'h' })
    expect(steps.some(step => step.endsWith('https://shop.example.com/api/bot/hook/slack/slack-1'))).toBe(true)
    expect(steps.join(' ')).toContain('message.channels, message.groups, message.im, app_mention')
    expect(steps.join(' ')).toContain('chat:write, channels:history, groups:history, im:history, app_mentions:read, reactions:write')
    expect(plugin.setup!({ ...connection, credentials: {}, hookSecret: 'h' })[1]).toContain('public address')
  })
})

describe('@owlmeans/server-bot — Slack mock', () => {
  const mockConnection = (extra: Record<string, string> = {}): BotPlatformConnection => ({
    ...connection, id: `slack-mock-${crypto.randomUUID()}`, transport: BotTransport.Mock, identity: undefined,
    credentials: extra, hookSecret: 'mock-hook-secret',
  })
  const call = async (fetch: BotFetch, method: string, body: object, token: string = ''): Promise<any> =>
    await (await fetch(`https://slack.com/api/${method}`, {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    })).json()

  test('auth.test answers a stable fake bot — or the admin for the user token', async () => {
    const conn = mockConnection({ userToken: 'xoxp-mock' })
    const fetch = plugin.mock.fetch(conn)
    const fake = plugin.mock.identityOf(conn.id)
    expect(await call(fetch, 'auth.test', {})).toMatchObject({ ok: true, user_id: fake.botUserId, bot_id: fake.botId, team_id: fake.teamId })
    const admin = await call(fetch, 'auth.test', {}, 'xoxp-mock')
    expect([admin.user_id, admin.bot_id, admin.team_id]).toEqual([fake.adminUserId, undefined, fake.teamId])
  })

  test('chat.postMessage answers increasing ts; chat.delete and reactions.add answer like Slack', async () => {
    const conn = mockConnection({ userToken: 'xoxp-mock' })
    const fetch = plugin.mock.fetch(conn)
    const first = await call(fetch, 'chat.postMessage', { channel: 'C1', text: 'one' })
    const second = await call(fetch, 'chat.postMessage', { channel: 'C1', text: 'two', thread_ts: first.ts })
    expect([first.ok, Number(second.ts) > Number(first.ts), /^\d+\.\d{6}$/.test(first.ts), second.message.thread_ts]).toEqual([true, true, true, first.ts])
    expect(await call(fetch, 'chat.postMessage', { channel: 'C1', text: ' ' })).toEqual({ ok: false, error: 'no_text' })

    expect(await call(fetch, 'chat.delete', { channel: 'C1', ts: first.ts })).toEqual({ ok: true, channel: 'C1', ts: first.ts })
    expect(await call(fetch, 'chat.delete', { channel: 'C1', ts: '1761480000.000100' })).toEqual({ ok: false, error: 'cant_delete_message' })
    expect(await call(fetch, 'chat.delete', { channel: 'C1', ts: '1761480000.000100' }, 'xoxp-mock')).toMatchObject({ ok: true })

    expect(await call(fetch, 'reactions.add', { channel: 'C1', timestamp: second.ts, name: 'eyes' })).toEqual({ ok: true })
    expect(await call(fetch, 'reactions.add', { channel: 'C1', timestamp: second.ts, name: 'eyes' })).toEqual({ ok: false, error: 'already_reacted' })
    expect(await call(fetch, 'reactions.add', { channel: 'C1', timestamp: second.ts, name: ':eyes:' })).toEqual({ ok: false, error: 'invalid_name' })
    expect(await call(fetch, 'conversations.kick', {})).toEqual({ ok: false, error: 'unknown_method' })
    expect(plugin.mock.calls(conn.id).map(entry => [entry.method, entry.auth])).toEqual([
      ['chat.postMessage', 'none'], ['chat.postMessage', 'none'], ['chat.postMessage', 'none'],
      ['chat.delete', 'none'], ['chat.delete', 'none'],
      ['chat.delete', 'user'], ['reactions.add', 'none'], ['reactions.add', 'none'], ['reactions.add', 'none'],
      ['conversations.kick', 'none'],
    ])
  })

  test('inbound is a signed event_callback the plugin accepts; the challenge too', () => {
    const conn = mockConnection()
    const fake = plugin.mock.identityOf(conn.id)
    const inbound = plugin.mock.inbound({ text: `hey @${fake.username} & <@U0OTHER001> <b>`, sender: { id: 'ann', name: 'Ann' } }, conn)
    expect(plugin.authenticate({ method: 'POST', headers: inbound.headers, body: inbound.body, rawBody: inbound.rawBody }, conn)).toEqual({ result: 'ok' })
    const body = inbound.body as any
    expect([body.type, body.team_id, body.event.type, body.event.channel_type, body.event.text]).toEqual([
      'event_callback', fake.teamId, 'message', 'channel', `hey <@${fake.botUserId}> &amp; <@U0OTHER001> &lt;b&gt;`,
    ])

    const [{ update }] = plugin.normalize(inbound.body, { ...conn, identity: { id: fake.botUserId, username: fake.username } })
    expect([update.addressed, update.sender?.name, update.chat.kind, update.message?.text])
      .toEqual([true, 'Ann', BotChatKind.Group, `hey <@${fake.botUserId}> & <@U0OTHER001> <b>`])

    const signedWithSecret = mockConnection({ signingSecret: SECRET })
    const challenge = plugin.mock.challenge(signedWithSecret, 'abc')
    expect(plugin.authenticate({ method: 'POST', headers: challenge.headers, rawBody: challenge.rawBody }, { ...signedWithSecret, transport: BotTransport.Live }))
      .toEqual({ result: 'challenge', reply: { challenge: 'abc' } })

    expect(() => plugin.mock.feed(conn.id, body)).toThrow('bot:unsupported-action:mock-feed:slack')
  })
})
