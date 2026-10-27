import { createHash, randomBytes, randomInt } from 'node:crypto'
import type { BotSimulateInput } from '@owlmeans/bot'
import type { BotHookRequest } from '../../types.js'
import type { BotFetch, BotFetchInit, BotMockCall, BotNativeInbound, BotPlatformConnection } from '../types.js'
import {
  WHATSAPP_HUB_MODE, WHATSAPP_MESSAGES_FIELD, WHATSAPP_MESSAGING_PRODUCT, WHATSAPP_MOCK_BUSINESS_NAME,
  WHATSAPP_MOCK_ID_BYTES, WHATSAPP_MOCK_NUMBER_PREFIX, WHATSAPP_MOCK_PHONE_ID_BASE, WHATSAPP_MOCK_SENDER_ID,
  WHATSAPP_MOCK_SENDER_NAME, WHATSAPP_SIGNATURE_HEADER, WHATSAPP_TEXT_MAX, WHATSAPP_WEBHOOK_OBJECT,
} from './consts.js'
import { whatsappSignatureHelper } from './signature.js'
import type {
  WhatsAppErrorEnvelope, WhatsAppMessage, WhatsAppMock, WhatsAppMockState, WhatsAppPhoneNumber, WhatsAppSendAnswer,
  WhatsAppWebhook,
} from './types.js'

/**
 * The Cloud API, faked per connection and in process: the same paths, answers and `{ error }`
 * refusals the Graph API gives, no network. `GET /<phone-number-id>` answers the connection's test
 * number, `POST /<phone-number-id>/messages` answers a random `wamid.…` per text or reaction, and the inbound
 * builder writes Meta's webhook payload signed with the app secret (the hook secret when there is none).
 */
export const makeWhatsAppMock = (): WhatsAppMock => {
  const states = new Map<string, WhatsAppMockState>()

  const stateOf = (connection: string): WhatsAppMockState => {
    let state = states.get(connection)
    if (state == null) {
      state = { calls: [], sent: new Set(), fed: [] }
      states.set(connection, state)
    }

    return state
  }

  /** A stable non-negative integer below `modulo`, derived from a text. */
  const hashOf = (text: string, modulo: number): number =>
    Number.parseInt(createHash('sha256').update(text).digest('hex').slice(0, 13), 16) % modulo

  const digitsOf = (value: string | undefined): string => (value ?? '').replace(/\D/g, '')

  const phoneNumberIdOf = (connection: BotPlatformConnection): string => {
    const given = connection.credentials.phoneNumberId ?? ''
    return given !== '' ? given : `${WHATSAPP_MOCK_PHONE_ID_BASE + hashOf(connection.id, 9 * WHATSAPP_MOCK_PHONE_ID_BASE)}`
  }

  const displayNumberOf = (connection: BotPlatformConnection): string =>
    `${WHATSAPP_MOCK_NUMBER_PREFIX}${`${hashOf(`${connection.id}:number`, 10_000_000)}`.padStart(7, '0')}`

  const businessAccountOf = (connection: BotPlatformConnection): string =>
    `${WHATSAPP_MOCK_PHONE_ID_BASE + hashOf(`${connection.id}:account`, 9 * WHATSAPP_MOCK_PHONE_ID_BASE)}`

  /** A customer's `wa_id` from a simulated id: a phone number stays itself, any other text maps to a stable number. */
  const waIdOf = (value: string | undefined): string => {
    if (value == null || value === '') {
      return WHATSAPP_MOCK_SENDER_ID
    }
    if (/^\+?\d{6,15}$/.test(value)) {
      return digitsOf(value)
    }

    return `1${`${hashOf(value, 10_000_000_000)}`.padStart(10, '0')}`
  }

  /** A fresh `wamid.…`: random, so no restart and no other process hands out one an inbox already holds. */
  const wamidOf = (connection: string): string =>
    `wamid.${Buffer.from(`mock:${connection}:${randomBytes(WHATSAPP_MOCK_ID_BYTES).toString('hex').toUpperCase()}`, 'utf8').toString('base64')}`

  const answer = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const refuse = (message: string, code: number = 100, subcode?: number): Response => {
    const envelope: WhatsAppErrorEnvelope = {
      error: {
        message: `(#${code}) ${message}`, type: 'OAuthException', code,
        ...(subcode != null ? { error_subcode: subcode } : {}), fbtrace_id: 'AMockTraceId',
      },
    }

    return answer(400, envelope)
  }

  const unknownObject = (id: string): Response => refuse(
    `Unsupported request. Object with ID '${id}' does not exist, cannot be loaded due to missing permissions, or does not support this operation`,
    100, 33
  )

  const aborted = (): Error => {
    const error = new Error('The operation was aborted.')
    error.name = 'AbortError'
    return error
  }

  const phoneNumber = (connection: BotPlatformConnection, id: string, fields: string | null): Response => {
    const full: Required<WhatsAppPhoneNumber> & Record<string, string> = {
      id,
      display_phone_number: displayNumberOf(connection),
      verified_name: connection.label !== '' ? connection.label : WHATSAPP_MOCK_BUSINESS_NAME,
      quality_rating: 'GREEN',
      code_verification_status: 'VERIFIED',
    }
    const wanted = fields != null && fields.trim() !== '' ? fields.split(',').map(field => field.trim()) : Object.keys(full)

    return answer(200, Object.fromEntries(Object.entries(full).filter(([key]) => key === 'id' || wanted.includes(key))))
  }

  const messages = (connection: BotPlatformConnection, state: WhatsAppMockState, params: Record<string, unknown>): Response => {
    if (params.messaging_product !== WHATSAPP_MESSAGING_PRODUCT) {
      return refuse('The parameter messaging_product is required.')
    }
    const to = typeof params.to === 'string' ? params.to : ''
    if (to.trim() === '') {
      return refuse('The parameter to is required.')
    }
    const type = typeof params.type === 'string' ? params.type : 'text'
    if (type === 'text') {
      const body = (params.text as { body?: unknown } | undefined)?.body
      if (typeof body !== 'string' || body.trim() === '') {
        return refuse('The parameter text[\'body\'] is required.')
      }
      if (body.length > WHATSAPP_TEXT_MAX) {
        return refuse(`Param text['body'] must be at most ${WHATSAPP_TEXT_MAX} characters long.`)
      }
    } else if (type === 'reaction') {
      const reaction = params.reaction as { message_id?: unknown, emoji?: unknown } | undefined
      if (typeof reaction?.message_id !== 'string' || reaction.message_id === '') {
        return refuse('The parameter reaction[\'message_id\'] is required.')
      }
      if (typeof reaction.emoji !== 'string') {
        return refuse('The parameter reaction[\'emoji\'] is required.')
      }
    } else {
      return refuse(`Param type must be one of {TEXT, REACTION} in this mock — got ${type}.`)
    }
    const id = wamidOf(connection.id)
    if (type === 'text') {
      state.sent.add(id)
    }
    const sent: WhatsAppSendAnswer = {
      messaging_product: WHATSAPP_MESSAGING_PRODUCT,
      contacts: [{ input: to, wa_id: digitsOf(to) }],
      messages: [{ id }],
    }

    return answer(200, sent)
  }

  const fetch = (connection: BotPlatformConnection): BotFetch => async (url: string, init?: BotFetchInit) => {
    if (init?.signal?.aborted === true) {
      throw aborted()
    }
    const parsed = new URL(url)
    // `/<version>/<phone-number-id>` or `/<version>/<phone-number-id>/messages`.
    const [, node, edge, ...rest] = parsed.pathname.split('/').filter(segment => segment !== '')
    const method = (init?.method ?? 'GET').toUpperCase()
    const state = stateOf(connection.id)
    const number = phoneNumberIdOf(connection)

    if (method === 'GET' && node != null && edge == null) {
      state.calls.push({ method: 'phone-number', params: Object.fromEntries(parsed.searchParams), at: new Date().toISOString() })
      return node === number ? phoneNumber(connection, node, parsed.searchParams.get('fields')) : unknownObject(node)
    }
    if (method === 'POST' && node != null && edge === WHATSAPP_MESSAGES_FIELD && rest.length === 0) {
      let params: Record<string, unknown>
      try {
        params = init?.body != null && init.body !== '' ? JSON.parse(init.body) as Record<string, unknown> : {}
      } catch {
        return refuse('Invalid JSON for postcontent')
      }
      state.calls.push({ method: 'messages', params, at: new Date().toISOString() })
      return node === number ? messages(connection, state, params) : unknownObject(node)
    }

    return refuse(`Unknown path components: /${[edge, ...rest].filter(part => part != null).join('/')}`, 2500)
  }

  const inbound = (input: BotSimulateInput, connection: BotPlatformConnection): BotNativeInbound => {
    const state = stateOf(connection.id)
    const from = waIdOf(input.sender?.id)
    const display = digitsOf(connection.identity?.username) !== '' ? digitsOf(connection.identity?.username) : displayNumberOf(connection)
    const message: WhatsAppMessage = {
      from,
      id: wamidOf(connection.id),
      timestamp: `${Math.floor(Date.now() / 1000)}`,
      type: 'text',
      text: { body: input.text },
      // The quoted message's author: the business when the fake API sent it, else the customer.
      ...(input.replyTo != null ? { context: { from: state.sent.has(input.replyTo.id) ? display : from, id: input.replyTo.id } } : {}),
    }
    const body: WhatsAppWebhook = {
      object: WHATSAPP_WEBHOOK_OBJECT,
      entry: [{
        id: businessAccountOf(connection),
        changes: [{
          value: {
            messaging_product: WHATSAPP_MESSAGING_PRODUCT,
            metadata: { display_phone_number: display, phone_number_id: connection.identity?.id ?? phoneNumberIdOf(connection) },
            contacts: [{ profile: { name: input.sender?.name ?? WHATSAPP_MOCK_SENDER_NAME }, wa_id: from }],
            messages: [message],
          },
          field: WHATSAPP_MESSAGES_FIELD,
        }],
      }],
    }
    const rawBody = JSON.stringify(body)
    const appSecret = connection.credentials.appSecret ?? ''

    return {
      body,
      rawBody,
      headers: {
        'content-type': 'application/json',
        [WHATSAPP_SIGNATURE_HEADER]: whatsappSignatureHelper.sign(rawBody, appSecret !== '' ? appSecret : connection.hookSecret),
      },
    }
  }

  const challenge: WhatsAppMock['challenge'] = (connection, opts = {}): BotHookRequest => ({
    method: 'GET',
    headers: {},
    query: {
      'hub.mode': WHATSAPP_HUB_MODE,
      'hub.challenge': opts.challenge ?? `${randomInt(1_000_000_000, 2_000_000_000)}`,
      'hub.verify_token': opts.verifyToken ?? (connection.credentials.verifyToken || connection.hookSecret),
    },
  })

  /** WhatsApp has no receiver (webhook only): a fed payload is kept, never delivered — `simulate` posts instead. */
  const feed = (connection: string, payload: unknown): void => {
    stateOf(connection).fed.push(payload)
  }

  const calls = (connection: string): BotMockCall[] => [...(states.get(connection)?.calls ?? [])]

  const reset = (connection?: string): void => {
    if (connection == null) {
      states.clear()
      return
    }
    states.delete(connection)
  }

  return { fetch, inbound, feed, calls, reset, phoneNumberIdOf, displayNumberOf, challenge }
}
