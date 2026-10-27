import {
  BOT_PLATFORMS, BotActionKind, BotCredentialsRejected, BotPlatform, BotTransport, BotUnsupportedAction,
} from '@owlmeans/bot'
import { botHookHelper } from '../hook.js'
import type {
  BotAuthentication, BotPlatformAction, BotPlatformActionResult, BotPlatformConnection, BotPlatformIdentity,
  BotPlatformPlugin, BotPlatformSession,
} from '../types.js'
import { makeWhatsAppApi } from './api.js'
import {
  WHATSAPP_API_BASE, WHATSAPP_API_VERSION, WHATSAPP_CREDENTIAL_ERROR_CODES, WHATSAPP_CREDENTIAL_STATUSES,
  WHATSAPP_HUB_MODE, WHATSAPP_MESSAGES_FIELD, WHATSAPP_MESSAGING_PRODUCT, WHATSAPP_PHONE_FIELDS,
  WHATSAPP_SETUP_CONSOLE, WHATSAPP_SETUP_STEPS, WHATSAPP_SIGNATURE_HEADER, WHATSAPP_TEXT_MAX,
  WHATSAPP_VERIFY_CREDENTIALS,
} from './consts.js'
import { WhatsAppApiError } from './errors.js'
import { makeWhatsAppMock } from './mock.js'
import { whatsappNormalizer } from './normalize.js'
import { whatsappSignatureHelper } from './signature.js'
import type { WhatsAppBotPlatformOptions, WhatsAppPhoneNumber, WhatsAppSendAnswer } from './types.js'

/**
 * The WhatsApp plugin over the Cloud API (https://developers.facebook.com/docs/whatsapp/cloud-api):
 * `GET /<phone-number-id>` verifies, a person sets the callback URL and verify token in Meta's
 * console (no hook registration), Meta's `hub.challenge` handshake and its `X-Hub-Signature-256`
 * authenticate, and `POST /<phone-number-id>/messages` replies, sends and reacts. Chats are
 * one-to-one with a customer's `wa_id`; nothing can be deleted, muted or banned.
 */
export const makeWhatsAppBotPlatform = (opts: WhatsAppBotPlatformOptions = {}): BotPlatformPlugin => {
  const root = `${(opts.base ?? WHATSAPP_API_BASE).replace(/\/+$/, '')}/${(opts.version ?? WHATSAPP_API_VERSION).replace(/^\/+|\/+$/g, '')}`
  const mock = makeWhatsAppMock()
  const api = (session: BotPlatformSession) => makeWhatsAppApi(session, root)

  /** The business number calls go out from — a mock connection without one gets its fake number. */
  const numberOf = (session: BotPlatformSession): string => {
    const given = session.connection.credentials.phoneNumberId ?? ''
    if (given !== '' || session.transport !== BotTransport.Mock) {
      return given
    }

    return mock.phoneNumberIdOf(session.connection)
  }

  /** Clipped to the text limit without splitting a surrogate pair. */
  const clip = (text: string): string => {
    if (text.length <= WHATSAPP_TEXT_MAX) {
      return text
    }
    const cut = text.slice(0, WHATSAPP_TEXT_MAX - 1)

    return `${/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut}…`
  }

  /** The verify token Meta's handshake must present: the typed one, else the hook secret (the core defaults it). */
  const verifyTokenOf = (connection: BotPlatformConnection): string =>
    (connection.credentials.verifyToken ?? '') !== '' ? connection.credentials.verifyToken : connection.hookSecret

  /** The key Meta signs with: the app secret; a mock connection without one signs with its hook secret. */
  const signingKeyOf = (connection: BotPlatformConnection): string => {
    const appSecret = connection.credentials.appSecret ?? ''
    return appSecret !== '' || connection.transport !== BotTransport.Mock ? appSecret : connection.hookSecret
  }

  const verify = async (session: BotPlatformSession): Promise<BotPlatformIdentity> => {
    const number = numberOf(session)
    if (session.transport === BotTransport.Live) {
      const missing = WHATSAPP_VERIFY_CREDENTIALS.filter(key => (session.connection.credentials[key] ?? '') === '')
      if (missing.length > 0) {
        throw new BotCredentialsRejected(`missing:${missing.join(',')}`)
      }
    }
    let phone: WhatsAppPhoneNumber
    try {
      phone = await api(session).get<WhatsAppPhoneNumber>(encodeURIComponent(number), { fields: WHATSAPP_PHONE_FIELDS })
    } catch (error) {
      if (error instanceof WhatsAppApiError
        && (WHATSAPP_CREDENTIAL_ERROR_CODES.includes(error.code) || WHATSAPP_CREDENTIAL_STATUSES.includes(error.status))) {
        throw new BotCredentialsRejected(`whatsapp:${error.code}`)
      }
      throw error
    }

    return {
      id: `${phone.id ?? number}`,
      ...(phone.display_phone_number != null && phone.display_phone_number !== '' ? { username: phone.display_phone_number } : {}),
      ...(phone.verified_name != null && phone.verified_name !== '' ? { name: phone.verified_name } : {}),
    }
  }

  const setup = (connection: BotPlatformConnection): string[] => [
    WHATSAPP_SETUP_CONSOLE,
    connection.hookUrl != null && connection.hookUrl !== ''
      ? `Set the Callback URL to ${connection.hookUrl}`
      : 'Set the Callback URL to this connection\'s hook URL — save the connection from the application\'s public address to see it.',
    `Set the Verify token to ${verifyTokenOf(connection)}`,
    ...WHATSAPP_SETUP_STEPS,
  ]

  /** A query value as text — the first of a repeated one; a `hub[mode]`-style nested parse is read too. */
  const hubParam = (query: Record<string, unknown> | undefined, name: string): string | undefined => {
    const flat = query?.[`hub.${name}`]
    const nested = (query?.hub as Record<string, unknown> | undefined)?.[name]
    const value = flat ?? nested

    return Array.isArray(value) ? (typeof value[0] === 'string' ? value[0] : undefined) : typeof value === 'string' ? value : undefined
  }

  const authenticate: BotPlatformPlugin['authenticate'] = (request, connection): BotAuthentication => {
    const method = request.method.toUpperCase()
    if (method === 'GET') {
      if (hubParam(request.query, 'mode') !== WHATSAPP_HUB_MODE) {
        return { result: 'reject', reason: 'hub-mode' }
      }
      if (!botHookHelper.sameSecret(hubParam(request.query, 'verify_token'), verifyTokenOf(connection))) {
        return { result: 'reject', reason: 'verify-token' }
      }
      const challenge = hubParam(request.query, 'challenge')
      if (challenge == null || challenge === '') {
        return { result: 'reject', reason: 'hub-challenge' }
      }

      return { result: 'challenge', text: challenge }
    }
    if (method !== 'POST') {
      return { result: 'reject', reason: 'method' }
    }
    const key = signingKeyOf(connection)
    if (key === '') {
      return { result: 'reject', reason: 'app-secret-missing' }
    }

    return whatsappSignatureHelper.verify(botHookHelper.header(request, WHATSAPP_SIGNATURE_HEADER), botHookHelper.rawText(request), key)
      ? { result: 'ok' }
      : { result: 'reject', reason: 'signature' }
  }

  const message = async (
    session: BotPlatformSession, to: string, content: Record<string, unknown>
  ): Promise<WhatsAppSendAnswer> => await api(session).post<WhatsAppSendAnswer>(
    `${encodeURIComponent(numberOf(session))}/${WHATSAPP_MESSAGES_FIELD}`,
    { messaging_product: WHATSAPP_MESSAGING_PRODUCT, recipient_type: 'individual', to, ...content }
  )

  const createdOf = (answer: WhatsAppSendAnswer, chat: string): BotPlatformActionResult => {
    const id = answer?.messages?.[0]?.id
    return typeof id === 'string' && id !== '' ? { message: { chat, id } } : {}
  }

  const act = async (session: BotPlatformSession, action: BotPlatformAction): Promise<BotPlatformActionResult> => {
    switch (action.kind) {
      case BotActionKind.Reply:
        return createdOf(await message(session, action.to.chat, {
          context: { message_id: action.to.id }, type: 'text', text: { body: clip(action.text) },
        }), action.to.chat)
      case BotActionKind.Send:
        return createdOf(await message(session, action.chat.id, {
          type: 'text', text: { body: clip(action.text) },
        }), action.chat.id)
      case BotActionKind.React:
        await message(session, action.message.chat, {
          type: 'reaction', reaction: { message_id: action.message.id, emoji: action.emoji },
        })
        return {}
      default:
        // The Cloud API cannot delete a customer's message, mute or ban — the core refuses first.
        throw new BotUnsupportedAction(action.kind)
    }
  }

  return {
    platform: BotPlatform.WhatsApp,
    descriptor: BOT_PLATFORMS[BotPlatform.WhatsApp],
    verify,
    setup,
    authenticate,
    normalize: whatsappNormalizer.normalize,
    act,
    mock,
  }
}

/** The built-in instance (`https://graph.facebook.com/v26.0`) — its `mock` is the one simulated connections use. */
export const whatsappBotPlatform = makeWhatsAppBotPlatform()
