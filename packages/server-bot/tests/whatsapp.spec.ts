import { afterEach, describe, expect, test } from 'bun:test'
import {
  BotActionKind, BotChatKind, BotConnectionStatus, BotCredentialsRejected, BotPlatform, BotReceiveMode,
  BotRuleAction, BotSignatureRejected, BotTransport, BotUnsupportedAction, BotUpdateKind, makeBotHookProtocols,
  type BotConnection, type BotUpdate,
} from '@owlmeans/bot'
import { BotInboxStatus } from '../src/consts.js'
import { botHandler } from '../src/handler.js'
import { botMockHelper } from '../src/mock/index.js'
import { BOT_BUILTIN_PLATFORMS } from '../src/platforms/consts.js'
import { serveBotHookEntrypoints } from '../src/serve-hook.js'
import { WHATSAPP_SIGNATURE_HEADER } from '../src/platforms/whatsapp/consts.js'
import { WhatsAppApiError } from '../src/platforms/whatsapp/errors.js'
import { makeWhatsAppBotPlatform, whatsappBotPlatform } from '../src/platforms/whatsapp/plugin.js'
import { whatsappSignatureHelper } from '../src/platforms/whatsapp/signature.js'
import type { WhatsAppMock } from '../src/platforms/whatsapp/types.js'
import type { BotPlatformConnection } from '../src/platforms/types.js'
import type { BotRuntime } from '../src/types.js'
import { invoke, makeTestBot, scopeOf, type TestBot } from './context.js'

// Payload shapes follow https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages
// (text, interactive, button) — the ids and numbers are Meta's own examples.
const PHONE_ID = '106540352242922'
const DISPLAY = '15550783881'
const CUSTOMER = '16505551234'

/** The business number as `GET /<phone-number-id>` answered it. */
const connection: BotConnection = {
  id: 'wa-1', scope: 'org', platform: BotPlatform.WhatsApp, label: 'Bakery', transport: BotTransport.Live,
  status: BotConnectionStatus.Connected, enabled: true, receive: BotReceiveMode.Webhook,
  identity: { id: PHONE_ID, username: DISPLAY, name: 'Owl Bakery' },
  credentialsSet: ['accessToken', 'appSecret', 'phoneNumberId', 'verifyToken'],
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
}
const plugin = whatsappBotPlatform
const mock = plugin.mock as WhatsAppMock

const webhook = (
  value: Record<string, unknown>, extra: Record<string, unknown>[] = [],
  metadata: Record<string, string> = { display_phone_number: DISPLAY, phone_number_id: PHONE_ID }
) => ({
  object: 'whatsapp_business_account',
  entry: [{
    id: '102290129340398',
    changes: [{
      value: { messaging_product: 'whatsapp', metadata, ...value },
      field: 'messages',
    }, ...extra],
  }],
})
const contacts = [{ profile: { name: 'Sheena Nelson' }, wa_id: CUSTOMER }]

const one = (payload: unknown) => {
  const updates = plugin.normalize(payload, connection)
  expect(updates.length).toBe(1)
  return updates[0]
}

describe('@owlmeans/server-bot — WhatsApp normalization (Cloud API webhook shapes)', () => {
  test('a text message: a private chat with the customer, addressed, deduplicated by its wamid', () => {
    const { platformId, update } = one(webhook({
      contacts,
      messages: [{ from: CUSTOMER, id: 'wamid.TEXT1', timestamp: '1749416383', type: 'text', text: { body: 'Does it come in another color?' } }],
    }))

    expect(platformId).toBe('wamid.TEXT1')
    expect(update).toMatchObject({
      kind: BotUpdateKind.Message,
      chat: { id: CUSTOMER, kind: BotChatKind.Private, title: 'Sheena Nelson' },
      sender: { id: CUSTOMER, name: 'Sheena Nelson', bot: false },
      message: { ref: { chat: CUSTOMER, id: 'wamid.TEXT1' }, text: 'Does it come in another color?', date: '2025-06-08T20:59:43.000Z' },
      addressed: true,
    })
    expect(update.message?.replyTo).toBeUndefined()
    expect(update.command).toBeUndefined()
  })

  test('a reply carries its context: quoting the business is a reply to the bot, quoting oneself is not', () => {
    const toBot = one(webhook({
      contacts,
      messages: [{
        from: CUSTOMER, id: 'wamid.R1', timestamp: '1749416383', type: 'text', text: { body: 'and on Sunday?' },
        context: { from: DISPLAY, id: 'wamid.BOT1' },
      }],
    })).update
    expect(toBot.message?.replyTo).toEqual({
      chat: CUSTOMER, id: 'wamid.BOT1', sender: { id: PHONE_ID, name: 'Owl Bakery', username: DISPLAY, bot: true },
    })

    const toSelf = one(webhook({
      contacts,
      messages: [{
        from: CUSTOMER, id: 'wamid.R2', timestamp: '1749416383', type: 'text', text: { body: 'see above' },
        context: { from: CUSTOMER, id: 'wamid.OWN' },
      }],
    })).update
    expect(toSelf.message?.replyTo).toEqual({ chat: CUSTOMER, id: 'wamid.OWN', sender: { id: CUSTOMER, name: 'Sheena Nelson', bot: false } })

    const forwarded = one(webhook({
      contacts,
      messages: [{ from: CUSTOMER, id: 'wamid.F1', timestamp: '1', type: 'text', text: { body: 'fwd' }, context: { forwarded: true } }],
    })).update
    expect(forwarded.message?.replyTo).toBeUndefined()
  })

  test('interactive button and list replies and a template quick-reply button read as their text', () => {
    const button = one(webhook({
      contacts,
      messages: [{
        context: { from: DISPLAY, id: 'wamid.ASK' }, from: CUSTOMER, id: 'wamid.I1', timestamp: '1', type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'cancel-button', title: 'Cancel' } },
      }],
    })).update
    expect([button.message?.text, button.message?.replyTo?.id, button.message?.replyTo?.sender?.bot]).toEqual(['Cancel', 'wamid.ASK', true])

    const list = one(webhook({
      contacts,
      messages: [{
        from: CUSTOMER, id: 'wamid.L1', timestamp: '1', type: 'interactive',
        interactive: { type: 'list_reply', list_reply: { id: 'priority_express', title: 'Priority Mail Express', description: 'Next Day to 2 Days' } },
      }],
    })).update
    expect(list.message?.text).toBe('Priority Mail Express')

    const quick = one(webhook({
      contacts,
      messages: [{ from: CUSTOMER, id: 'wamid.B1', timestamp: '1', type: 'button', button: { payload: 'Unsubscribe', text: 'Unsubscribe' } }],
    })).update
    expect(quick.message?.text).toBe('Unsubscribe')
  })

  test('a media caption is the text; a slash command is a command', () => {
    const photo = one(webhook({
      contacts,
      messages: [{ from: CUSTOMER, id: 'wamid.P1', timestamp: '1', type: 'image', image: { id: 'm1', mime_type: 'image/jpeg', caption: 'this cake' } }],
    })).update
    expect(photo.message?.text).toBe('this cake')

    const command = one(webhook({
      contacts,
      messages: [{ from: CUSTOMER, id: 'wamid.C1', timestamp: '1', type: 'text', text: { body: '/order 2 croissants' } }],
    })).update
    expect([command.kind, command.command]).toEqual([BotUpdateKind.Command, { name: 'order', args: '2 croissants' }])
  })

  test('several messages, changes and entries become several updates, each sender named from its contact', () => {
    const payload = webhook({
      contacts: [...contacts, { profile: { name: 'Ann' }, wa_id: '447700900123' }],
      messages: [
        { from: '447700900123', id: 'wamid.M1', timestamp: '1', type: 'text', text: { body: 'first' } },
        { from: CUSTOMER, id: 'wamid.M2', timestamp: '2', type: 'text', text: { body: 'second' } },
      ],
    }, [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp', metadata: { display_phone_number: DISPLAY, phone_number_id: PHONE_ID },
        messages: [{ from: CUSTOMER, id: 'wamid.M3', timestamp: '3', type: 'text', text: { body: 'third' } }],
      },
    }])

    expect(plugin.normalize(payload, connection).map(({ platformId, update }) => [platformId, update.sender?.name ?? null, update.message?.text]))
      .toEqual([['wamid.M1', 'Ann', 'first'], ['wamid.M2', 'Sheena Nelson', 'second'], ['wamid.M3', null, 'third']])
  })

  test('statuses, unread kinds, another number\'s messages and garbage normalize to nothing', () => {
    expect(plugin.normalize(webhook({
      statuses: [{ id: 'wamid.S1', status: 'delivered', timestamp: '1750263773', recipient_id: CUSTOMER, conversation: { id: 'c', origin: { type: 'service' } }, pricing: { billable: true, pricing_model: 'CBP', category: 'service' } }],
    }), connection)).toEqual([])
    expect(plugin.normalize(webhook({
      contacts,
      messages: [
        { from: CUSTOMER, id: 'wamid.X1', timestamp: '1', type: 'reaction', reaction: { message_id: 'wamid.BOT1', emoji: '👍' } },
        { from: CUSTOMER, id: 'wamid.X2', timestamp: '1', type: 'sticker', sticker: { id: 's' } },
        { from: CUSTOMER, id: 'wamid.X3', timestamp: '1', type: 'unsupported', errors: [{ code: 131051 }] },
      ],
    }), connection)).toEqual([])
    const elsewhere = webhook(
      { contacts, messages: [{ from: CUSTOMER, id: 'wamid.E1', timestamp: '1', type: 'text', text: { body: 'hi' } }] },
      [], { display_phone_number: '15550000000', phone_number_id: '999' }
    )
    expect(plugin.normalize(elsewhere, connection)).toEqual([])
    expect(plugin.normalize({ ...webhook({ contacts, messages: [] }), object: 'page' }, connection)).toEqual([])
    expect(plugin.normalize({ nope: true }, connection)).toEqual([])
    expect(plugin.normalize(null, connection)).toEqual([])
  })
})

describe('@owlmeans/server-bot — WhatsApp hook authentication', () => {
  const platformConnection: BotPlatformConnection = {
    ...connection,
    credentials: { accessToken: 'EAAG-token', phoneNumberId: PHONE_ID, appSecret: 'app-secret-1', verifyToken: 'the-hook-secret' },
    hookSecret: 'the-hook-secret',
  }
  const handshake = (query: Record<string, unknown>) => plugin.authenticate({ method: 'GET', headers: {}, query }, platformConnection)

  test('the hub.challenge handshake is answered only for subscribe with the connection\'s verify token', () => {
    const valid = { 'hub.mode': 'subscribe', 'hub.verify_token': 'the-hook-secret', 'hub.challenge': '1158201444' }

    expect(handshake(valid)).toEqual({ result: 'challenge', text: '1158201444' })
    expect(handshake({ hub: { mode: 'subscribe', verify_token: 'the-hook-secret', challenge: '7' } })).toEqual({ result: 'challenge', text: '7' })
    expect(handshake({ ...valid, 'hub.verify_token': 'guess' })).toEqual({ result: 'reject', reason: 'verify-token' })
    expect(handshake({ ...valid, 'hub.verify_token': undefined })).toEqual({ result: 'reject', reason: 'verify-token' })
    expect(handshake({ ...valid, 'hub.mode': 'unsubscribe' })).toEqual({ result: 'reject', reason: 'hub-mode' })
    expect(handshake({ ...valid, 'hub.challenge': '' })).toEqual({ result: 'reject', reason: 'hub-challenge' })
    // A typed verify token wins over the hook secret.
    const typed = { ...platformConnection, credentials: { ...platformConnection.credentials, verifyToken: 'typed-token' } }
    expect(plugin.authenticate({ method: 'GET', headers: {}, query: valid }, typed)).toEqual({ result: 'reject', reason: 'verify-token' })
  })

  test('X-Hub-Signature-256 is the HMAC-SHA256 of the raw bytes with the app secret', () => {
    // Meta escapes non-ASCII in the bytes it signs — only the raw body verifies, never a re-serialization.
    const rawBody = '{"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"value":{"messages":[{"text":{"body":"caf\\u00e9"}}]},"field":"messages"}]}]}'
    const body = JSON.parse(rawBody)
    const signature = whatsappSignatureHelper.sign(rawBody, 'app-secret-1')
    const post = (headers: Record<string, string>, raw: string | null = rawBody) =>
      plugin.authenticate({ method: 'POST', headers, body, ...(raw != null ? { rawBody: raw } : {}) }, platformConnection)

    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/)
    expect(post({ [WHATSAPP_SIGNATURE_HEADER]: signature })).toEqual({ result: 'ok' })
    expect(post({ 'X-Hub-Signature-256': signature.toUpperCase().replace('SHA256=', 'sha256=') })).toEqual({ result: 'ok' })
    expect(post({ [WHATSAPP_SIGNATURE_HEADER]: whatsappSignatureHelper.sign(rawBody, 'another-secret') })).toEqual({ result: 'reject', reason: 'signature' })
    expect(post({ [WHATSAPP_SIGNATURE_HEADER]: signature }, rawBody.replace('caf', 'cav'))).toEqual({ result: 'reject', reason: 'signature' })
    expect(post({ [WHATSAPP_SIGNATURE_HEADER]: signature }, null)).toEqual({ result: 'reject', reason: 'signature' })
    expect(post({ [WHATSAPP_SIGNATURE_HEADER]: signature.slice('sha256='.length) })).toEqual({ result: 'reject', reason: 'signature' })
    expect(post({})).toEqual({ result: 'reject', reason: 'signature' })
    expect(plugin.authenticate({ method: 'PUT', headers: {} }, platformConnection)).toEqual({ result: 'reject', reason: 'method' })
    const unsigned = { ...platformConnection, credentials: { ...platformConnection.credentials, appSecret: '' } }
    expect(plugin.authenticate({ method: 'POST', headers: { [WHATSAPP_SIGNATURE_HEADER]: whatsappSignatureHelper.sign(rawBody, 'the-hook-secret') }, body, rawBody }, unsigned))
      .toEqual({ result: 'reject', reason: 'app-secret-missing' })
  })
})

describe('@owlmeans/server-bot — WhatsApp Graph API and mock', () => {
  const live: BotPlatformConnection = {
    ...connection, credentials: { accessToken: 'EAAG-token', phoneNumberId: PHONE_ID, appSecret: 's' }, hookSecret: 'h',
  }

  test('verify GETs the phone number with a Bearer token — base and version are overridable', async () => {
    const seen: [string, string | undefined][] = []
    const platform = makeWhatsAppBotPlatform({ base: 'https://graph.example.org/', version: 'v99.0' })
    const identity = await platform.verify({
      connection: live,
      transport: BotTransport.Live,
      fetch: async (url, init) => {
        seen.push([url, init?.headers?.authorization])
        expect(init?.method).toBe('GET')
        return new Response(JSON.stringify({ display_phone_number: '15555555555', verified_name: 'Support Number', id: PHONE_ID }))
      },
    })

    expect(seen).toEqual([[`https://graph.example.org/v99.0/${PHONE_ID}?fields=display_phone_number%2Cverified_name`, 'Bearer EAAG-token']])
    expect(identity).toEqual({ id: PHONE_ID, username: '15555555555', name: 'Support Number' })
  })

  test('a refused token is BotCredentialsRejected; a transport fault never carries the token', async () => {
    const refused = plugin.verify({
      connection: live,
      transport: BotTransport.Live,
      fetch: async () => new Response(JSON.stringify({
        error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190, fbtrace_id: 'A' },
      }), { status: 401 }),
    })
    await expect(refused).rejects.toBeInstanceOf(BotCredentialsRejected)
    await expect(refused).rejects.toThrow('bot:credentials-rejected:whatsapp:190')

    const unreachable = plugin.act({
      connection: live,
      transport: BotTransport.Live,
      fetch: async () => { throw new TypeError('fetch failed: Authorization: Bearer EAAG-token') },
    }, { kind: BotActionKind.Send, chat: { id: CUSTOMER, kind: BotChatKind.Private }, text: 'hi' })
    await expect(unreachable).rejects.toBeInstanceOf(WhatsAppApiError)
    await expect(unreachable).rejects.toThrow('bot:whatsapp:503:POST messages: unreachable')

    const missing = plugin.verify({ connection: { ...live, credentials: { accessToken: 'x' } }, transport: BotTransport.Live, fetch: async () => new Response('{}') })
    await expect(missing).rejects.toThrow('bot:credentials-rejected:missing:phoneNumberId')
  })

  test('delete, mute and ban are refused by the plugin itself', async () => {
    const session = { connection: live, transport: BotTransport.Live, fetch: async () => new Response('{}') }

    await expect(plugin.act(session, { kind: BotActionKind.Delete, message: { chat: CUSTOMER, id: 'wamid.1' } })).rejects.toBeInstanceOf(BotUnsupportedAction)
    await expect(plugin.act(session, { kind: BotActionKind.Mute, chat: CUSTOMER, user: CUSTOMER, until: new Date() })).rejects.toThrow('bot:unsupported-action:mute')
    await expect(plugin.act(session, { kind: BotActionKind.Ban, chat: CUSTOMER, user: CUSTOMER })).rejects.toThrow('bot:unsupported-action:ban')
  })

  test('the mock answers like the Graph API: wamids, contacts, `{ error }` refusals, recorded calls', async () => {
    const mockConnection: BotPlatformConnection = { ...live, id: `mock-${Date.now()}`, transport: BotTransport.Mock, credentials: {} }
    const fetch = plugin.mock.fetch(mockConnection)
    const number = mock.phoneNumberIdOf(mockConnection)
    const post = async (body: object, id: string = number): Promise<any> =>
      await (await fetch(`https://graph.facebook.com/v26.0/${id}/messages`, { method: 'POST', body: JSON.stringify(body) })).json()
    const text = (body: string) => ({ messaging_product: 'whatsapp', recipient_type: 'individual', to: CUSTOMER, type: 'text', text: { body } })

    expect(number).toMatch(/^\d{15}$/)
    const first = await post(text('one'))
    const second = await post(text('two'))
    expect(first.contacts).toEqual([{ input: CUSTOMER, wa_id: CUSTOMER }])
    expect([first.messages[0].id.startsWith('wamid.'), first.messages[0].id === second.messages[0].id]).toEqual([true, false])
    expect((await post(text(' '))).error).toMatchObject({ code: 100, type: 'OAuthException', message: '(#100) The parameter text[\'body\'] is required.' })
    expect((await post(text('x'), '123')).error).toMatchObject({ code: 100, error_subcode: 33 })
    const phone = await (await fetch(`https://graph.facebook.com/v26.0/${number}?fields=verified_name`)).json()
    expect(phone).toEqual({ id: number, verified_name: 'Bakery' })
    expect(plugin.mock.calls(mockConnection.id).map(call => call.method)).toEqual(['messages', 'messages', 'messages', 'messages', 'phone-number'])
  })
})

describe('@owlmeans/server-bot — WhatsApp through the service (mock transport)', () => {
  const runtimes: BotRuntime[] = []
  afterEach(async () => {
    await Promise.all(runtimes.splice(0).map(async runtime => { await runtime.stop() }))
  })
  const hook = makeBotHookProtocols({ base: { alias: 'api:bot:hook', path: '/bot/hook' } })

  const connect = async (bot: TestBot, scope: string, credentials?: Record<string, string>) => {
    const saved = await bot.service.connections.save(scope, {
      platform: BotPlatform.WhatsApp, label: 'Bakery', transport: BotTransport.Mock, ...(credentials != null ? { credentials } : {}),
    }, 'https://shop.example.com')
    return await bot.service.connections.verify(scope, saved.id)
  }

  test('WhatsApp is a built-in platform', () => {
    expect(BOT_BUILTIN_PLATFORMS.map(entry => entry.platform)).toContain(BotPlatform.WhatsApp)
  })

  test('save → verify: a webhook connection with the mock number and the manual setup steps', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const verified = await connect(bot, scope)
    const record = await bot.connections.get(verified.id)
    const opened = { ...verified, credentials: {}, hookSecret: record.hookSecret }

    expect([verified.status, verified.receive, verified.hookUrl]).toEqual([
      BotConnectionStatus.Connected, BotReceiveMode.Webhook, `https://shop.example.com/api/bot/hook/whatsapp/${verified.id}`,
    ])
    expect(verified.identity).toEqual({ id: mock.phoneNumberIdOf(opened), username: mock.displayNumberOf(opened), name: 'Bakery' })
    expect(verified.credentialsSet).toContain('verifyToken')
    expect(verified.setup?.[1]).toBe(`Set the Callback URL to ${verified.hookUrl}`)
    expect(verified.setup?.[2]).toBe(`Set the Verify token to ${record.hookSecret}`)
    expect(verified.setup?.some(step => step.includes('"messages"'))).toBe(true)
    expect(mock.calls(verified.id).map(call => [call.method, call.params])).toEqual([['phone-number', { fields: 'display_phone_number,verified_name' }]])
  })

  test('simulate → runtime: a handler replies and reacts — the Cloud API bodies, activity as mock', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    const hours = await bot.service.rules.save(scope, { name: 'Hours', keywords: ['open'], action: BotRuleAction.Reply, reply: 'We open at 7.' })
    const seen: BotUpdate[] = []
    const runtime = bot.service.runtime([botHandler('answer', async (update, actions) => {
      seen.push(update)
      for (const match of update.matches) {
        const reply = await actions.reply(update, match.rule.reply!, { rule: match.rule.id })
        expect(reply.ok).toBe(true)
        expect(reply.message?.chat).toBe(update.chat.id)
        expect(reply.message?.id.startsWith('wamid.')).toBe(true)
        expect((await actions.react(update, '🥐', { rule: match.rule.id })).ok).toBe(true)
      }
    })])
    runtimes.push(runtime)

    const { update } = await bot.service.simulate(scope, connection.id, { text: 'When are you OPEN?', sender: { id: '+447700900123', name: 'Ann' } })
    expect(await runtime.dispatch()).toBe(1)

    const [message] = seen
    expect([message.chat, message.sender, message.addressed, message.matches.map(match => match.rule.id)]).toEqual([
      { id: '447700900123', kind: BotChatKind.Private, title: 'Ann' }, { id: '447700900123', name: 'Ann', bot: false }, true, [hours.id],
    ])
    expect((await bot.updates.get(update)).status).toBe(BotInboxStatus.Done)
    const sent = mock.calls(connection.id).filter(call => call.method === 'messages').map(call => call.params)
    expect(sent).toEqual([
      {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: '447700900123',
        context: { message_id: message.message!.ref.id }, type: 'text', text: { body: 'We open at 7.' },
      },
      {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: '447700900123',
        type: 'reaction', reaction: { message_id: message.message!.ref.id, emoji: '🥐' },
      },
    ])
    const activity = await bot.service.activity.list(scope)
    expect(activity.map(entry => [entry.action, entry.ok, entry.transport, entry.rule, entry.update, entry.target])).toEqual([
      [BotActionKind.React, true, BotTransport.Mock, hours.id, update, { chat: '447700900123', message: message.message!.ref.id }],
      [BotActionKind.Reply, true, BotTransport.Mock, hours.id, update, { chat: '447700900123', message: message.message!.ref.id }],
    ])
  })

  test('a simulated reply to the bot\'s own message is a reply to the bot', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    const actions = await bot.service.actions({ scope, connection: connection.id })
    const sent = await actions.send(CUSTOMER, 'Your order is ready')
    const { update } = await bot.service.simulate(scope, connection.id, { text: 'thanks', sender: { id: CUSTOMER }, replyTo: { id: sent.message!.id } })

    expect((await bot.updates.get(update)).update.message?.replyTo).toEqual({
      chat: CUSTOMER, id: sent.message!.id, sender: { id: connection.identity!.id, name: 'Bakery', username: connection.identity!.username, bot: true },
    })
  })

  test('delete, mute and ban answer ok:false with a failed activity — never a throw', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    const runtime = bot.service.runtime([botHandler('moderate', async (update, actions) => {
      expect([actions.supports(BotActionKind.Reply), actions.supports(BotActionKind.React), actions.supports(BotActionKind.Delete)])
        .toEqual([true, true, false])
      expect(await actions.delete(update)).toEqual({ ok: false, error: 'WhatsApp cannot delete messages.', code: 'bot:unsupported-action:delete' })
      expect(await actions.mute(update, { minutes: 5 })).toEqual({ ok: false, error: 'WhatsApp cannot mute members.', code: 'bot:unsupported-action:mute' })
      expect(await actions.ban(update)).toEqual({ ok: false, error: 'WhatsApp cannot ban members.', code: 'bot:unsupported-action:ban' })
    })])
    runtimes.push(runtime)
    await bot.service.simulate(scope, connection.id, { text: 'spam' })
    await runtime.dispatch()

    expect((await bot.service.activity.list(scope)).map(entry => [entry.action, entry.ok, entry.transport])).toEqual([
      [BotActionKind.Ban, false, BotTransport.Mock], [BotActionKind.Mute, false, BotTransport.Mock], [BotActionKind.Delete, false, BotTransport.Mock],
    ])
    expect(mock.calls(connection.id).filter(call => call.method === 'messages')).toEqual([])
  })

  test('the hook routes: the GET handshake answers hub.challenge; a signed POST is stored once; forged or stale ones are refused', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope)
    const record = await bot.connections.get(connection.id)
    const bindings = serveBotHookEntrypoints(hook)
    bot.context.registerEntrypoints(bindings)
    const at = (alias: string) => bindings.find(binding => binding.alias === alias)!
    const params = { platform: BotPlatform.WhatsApp, connection: connection.id }
    const opened = { ...connection, credentials: {}, hookSecret: record.hookSecret }

    const handshake = mock.challenge(opened, { challenge: '1158201444' })
    expect(await invoke(at(hook.challenge.alias), { params, query: handshake.query })).toBe('1158201444')
    await expect(invoke(at(hook.challenge.alias), { params, query: mock.challenge(opened, { verifyToken: 'guess' }).query }))
      .rejects.toBeInstanceOf(BotSignatureRejected)

    const signed = botMockHelper.inbound(BotPlatform.WhatsApp, { text: 'hello' }, record)
    const request = { params, headers: signed.headers, body: signed.body, original: { rawBody: signed.rawBody } }
    expect(await invoke(at(hook.receive.alias), request)).toEqual({ ok: true })
    expect(await invoke(at(hook.receive.alias), request)).toEqual({ ok: true })
    expect(await bot.updates.count({ connection: connection.id })).toBe(1)

    const forged = botMockHelper.inbound(BotPlatform.WhatsApp, { text: 'forged' }, { ...record, hookSecret: 'not-the-secret' })
    await expect(invoke(at(hook.receive.alias), { params, headers: forged.headers, body: forged.body, original: { rawBody: forged.rawBody } }))
      .rejects.toBeInstanceOf(BotSignatureRejected)
    await expect(invoke(at(hook.receive.alias), {
      params, headers: signed.headers, body: signed.body, original: { rawBody: signed.rawBody.replace('hello', 'hellO') },
    })).rejects.toBeInstanceOf(BotSignatureRejected)

    const statuses = JSON.stringify(webhook({ statuses: [{ id: 'wamid.S', status: 'read', timestamp: '1', recipient_id: CUSTOMER }] }))
    const receipt = await bot.service.receive(BotPlatform.WhatsApp, connection.id, {
      method: 'POST', headers: { [WHATSAPP_SIGNATURE_HEADER]: whatsappSignatureHelper.sign(statuses, record.hookSecret) }, rawBody: statuses,
    })
    expect(receipt).toEqual({ reply: { ok: true }, updates: [] })
    expect(await bot.updates.count({ connection: connection.id })).toBe(1)
  })

  test('a mock connection with an app secret is signed and checked with it, not with the hook secret', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const connection = await connect(bot, scope, { appSecret: 'mock-app-secret' })
    const record = await bot.connections.get(connection.id)

    const { update } = await bot.service.simulate(scope, connection.id, { text: 'signed with the app secret' })
    expect((await bot.updates.get(update)).update.message?.text).toBe('signed with the app secret')

    const signedByApp = botMockHelper.inbound(BotPlatform.WhatsApp, { text: 'a' }, { ...record, credentials: { appSecret: 'mock-app-secret' } })
    const signedByHook = botMockHelper.inbound(BotPlatform.WhatsApp, { text: 'b' }, record)
    const receive = async (inbound: typeof signedByApp) => await bot.service.receive(BotPlatform.WhatsApp, connection.id, {
      method: 'POST', headers: inbound.headers, body: inbound.body, rawBody: inbound.rawBody,
    })
    expect((await receive(signedByApp)).updates.length).toBe(1)
    await expect(receive(signedByHook)).rejects.toBeInstanceOf(BotSignatureRejected)
  })

  test('a live connection needs its credentials to verify', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const saved = await bot.service.connections.save(scope, { platform: BotPlatform.WhatsApp, label: 'Live', credentials: { accessToken: 'x' } })

    await expect(bot.service.connections.verify(scope, saved.id)).rejects.toBeInstanceOf(BotCredentialsRejected)
    const failed = await bot.service.connections.get(scope, saved.id)
    expect([failed.status, failed.lastError]).toEqual([BotConnectionStatus.Failed, 'bot:credentials-rejected:missing:phoneNumberId,appSecret'])
  })
})
