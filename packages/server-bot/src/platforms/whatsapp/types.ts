import type { BotConnection } from '@owlmeans/bot'
import type { BotHookRequest } from '../../types.js'
import type { BotNormalizedUpdate, BotPlatformConnection, BotPlatformMock, BotPlatformSession } from '../types.js'

// ─── Native Cloud API shapes (https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages) — the fields used ───

export interface WhatsAppMetadata {
  display_phone_number: string
  phone_number_id: string
}

export interface WhatsAppContact {
  profile?: { name?: string }
  wa_id: string
}

/** The quoted message (a reply), or a forwarded flag. */
export interface WhatsAppContext {
  /** Who wrote the quoted message — the business number when it is the bot's. */
  from?: string
  id?: string
  forwarded?: boolean
  frequently_forwarded?: boolean
}

export interface WhatsAppInteractive {
  type: 'button_reply' | 'list_reply' | string
  button_reply?: { id: string, title: string }
  list_reply?: { id: string, title: string, description?: string }
}

export interface WhatsAppMedia {
  id?: string
  caption?: string
  mime_type?: string
}

export interface WhatsAppMessage {
  /** The customer's WhatsApp id (`wa_id`). */
  from: string
  /** `wamid.…` */
  id: string
  /** Unix seconds, as text. */
  timestamp: string
  type: string
  text?: { body: string }
  interactive?: WhatsAppInteractive
  /** A template's quick-reply button. */
  button?: { text?: string, payload?: string }
  image?: WhatsAppMedia
  video?: WhatsAppMedia
  document?: WhatsAppMedia
  context?: WhatsAppContext
}

/** A delivery receipt of a message the business sent. */
export interface WhatsAppStatus {
  id: string
  status: string
  timestamp: string
  recipient_id: string
}

export interface WhatsAppValue {
  messaging_product: string
  metadata: WhatsAppMetadata
  contacts?: WhatsAppContact[]
  messages?: WhatsAppMessage[]
  statuses?: WhatsAppStatus[]
}

export interface WhatsAppChange {
  field: string
  value: WhatsAppValue
}

export interface WhatsAppEntry {
  /** The WhatsApp Business Account id. */
  id: string
  changes: WhatsAppChange[]
}

/** One webhook POST — Meta may batch several entries, changes and messages. */
export interface WhatsAppWebhook {
  object: string
  entry: WhatsAppEntry[]
}

/** `GET /<phone-number-id>?fields=display_phone_number,verified_name` */
export interface WhatsAppPhoneNumber {
  id: string
  display_phone_number?: string
  verified_name?: string
}

/** `POST /<phone-number-id>/messages` — what it answers. */
export interface WhatsAppSendAnswer {
  messaging_product: string
  contacts?: { input: string, wa_id: string }[]
  messages: { id: string, message_status?: string }[]
}

/** Every Graph API refusal. */
export interface WhatsAppErrorEnvelope {
  error: {
    message: string
    type?: string
    code: number
    error_subcode?: number
    error_data?: { messaging_product?: string, details?: string }
    fbtrace_id?: string
  }
}

// ─── The plugin's parts ───

export interface WhatsAppBotPlatformOptions {
  /** The Graph API host, default `https://graph.facebook.com`. */
  base?: string
  /** The Graph API version, default `v26.0`; calls go to `<base>/<version>/…`. */
  version?: string
}

export interface WhatsAppCallOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

/** The Graph API over a session's transport, the access token as a Bearer header. */
export interface WhatsAppApi {
  /** GET `<root>/<path>?<query>`. @throws {WhatsAppApiError} an `error` answer */
  get: <T>(path: string, query?: Record<string, string>, opts?: WhatsAppCallOptions) => Promise<T>
  /** POST `<root>/<path>` with a JSON body. @throws {WhatsAppApiError} an `error` answer */
  post: <T>(path: string, body: Record<string, unknown>, opts?: WhatsAppCallOptions) => Promise<T>
}

export interface WhatsAppApiFactory {
  /** `root` = `<base>/<version>`. */
  (session: Pick<BotPlatformSession, 'connection' | 'fetch'>, root: string): WhatsAppApi
}

/** Meta's `X-Hub-Signature-256` — HMAC-SHA256 of the raw body, keyed by the app secret. */
export interface WhatsAppSignatureHelper {
  /** The header value for `rawBody`: `sha256=<lower-case hex>`. */
  sign: (rawBody: string, secret: string) => string
  /** Whether `header` signs `rawBody` with `secret` — timing-safe; an empty secret never matches. */
  verify: (header: string | undefined, rawBody: string, secret: string) => boolean
}

export interface WhatsAppNormalizer {
  /**
   * Every `messages[]` of every change of a `whatsapp_business_account` payload → one update each
   * (text, interactive and button replies, media captions); statuses and other kinds → none.
   */
  normalize: (payload: unknown, connection: BotConnection) => BotNormalizedUpdate[]
}

export interface WhatsAppMock extends BotPlatformMock {
  /** The phone number id the fake API answers for a connection (its `phoneNumberId`, else one derived from its id). */
  phoneNumberIdOf: (connection: BotPlatformConnection) => string
  /** The business number the fake API shows for a connection (`1555…`). */
  displayNumberOf: (connection: BotPlatformConnection) => string
  /** The subscription handshake Meta sends (GET `hub.*`) — with the connection's verify token unless one is given. */
  challenge: (connection: BotPlatformConnection, opts?: { challenge?: string, verifyToken?: string }) => BotHookRequest
}

/** One mock connection's state. */
export interface WhatsAppMockState {
  calls: { method: string, params: Record<string, unknown>, at: string }[]
  /** Message ids the fake business sent — a simulated reply to one quotes the bot. */
  sent: Set<string>
  /** Payloads `feed` was handed — WhatsApp has no receiver, so nothing drains them. */
  fed: unknown[]
}
