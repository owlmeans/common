/** The Graph API host — override `base` (and `version`) through `makeWhatsAppBotPlatform`. */
export const WHATSAPP_API_BASE = 'https://graph.facebook.com'

/** The Graph API version calls go to: `<base>/<version>/…`. */
export const WHATSAPP_API_VERSION = 'v26.0'

/** The header Meta signs every webhook POST in (lower-cased, as servers hand it over). */
export const WHATSAPP_SIGNATURE_HEADER = 'x-hub-signature-256'

/** What precedes the hex HMAC-SHA256 digest in the signature header. */
export const WHATSAPP_SIGNATURE_PREFIX = 'sha256='

/** `object` of every WhatsApp Business Account webhook payload. */
export const WHATSAPP_WEBHOOK_OBJECT = 'whatsapp_business_account'

/** The webhook field a connection subscribes to — incoming messages and the statuses of sent ones. */
export const WHATSAPP_MESSAGES_FIELD = 'messages'

/** The subscription handshake's `hub.mode`. */
export const WHATSAPP_HUB_MODE = 'subscribe'

/** What `verify` reads of the business phone number. */
export const WHATSAPP_PHONE_FIELDS = 'display_phone_number,verified_name'

/** `messaging_product` of every Cloud API message. */
export const WHATSAPP_MESSAGING_PRODUCT = 'whatsapp'

/** How long one Graph API call may take. */
export const WHATSAPP_CALL_TIMEOUT_MS = 15_000

/** `text.body` limit — longer text is clipped. */
export const WHATSAPP_TEXT_MAX = 4096

/** The credentials a live `verify` calls with (the app secret only signs inbound requests). */
export const WHATSAPP_VERIFY_CREDENTIALS = Object.freeze(['accessToken', 'phoneNumberId'])

/** Graph error codes that refuse the access token or the phone number id (verification fails on them). */
export const WHATSAPP_CREDENTIAL_ERROR_CODES = Object.freeze([0, 3, 10, 100, 190])

/** HTTP statuses that refuse the credentials whatever the error code. */
export const WHATSAPP_CREDENTIAL_STATUSES = Object.freeze([401, 403, 404])

/** The incoming message types whose text the bot reads (media by their caption). */
export const WHATSAPP_CAPTIONED_TYPES = Object.freeze(['image', 'video', 'document'])

/** Where the callback URL and the verify token are pasted (the plugin's first two steps name them). */
export const WHATSAPP_SETUP_CONSOLE = 'In the Meta App Dashboard, open WhatsApp → Configuration → Webhook and press Edit.'

/** The steps after the callback URL and the verify token. */
export const WHATSAPP_SETUP_STEPS = Object.freeze([
  'Under Webhook fields, subscribe to "messages".',
  'Use a permanent System User access token with the whatsapp_business_messaging permission — the temporary token of the API Setup page expires within a day.',
  'A Meta app posts the messages of all its numbers to one callback URL: give every connected number its own app.',
  'Customers write first: WhatsApp lets the bot answer a customer within 24 hours of their last message.',
])

/** The mock's simulated defaults: one customer writing to a test business number. */
export const WHATSAPP_MOCK_SENDER_ID = '15551230001'
export const WHATSAPP_MOCK_SENDER_NAME = 'Test customer'
export const WHATSAPP_MOCK_BUSINESS_NAME = 'Mock business'
/** A mock business number is `1555` and seven digits derived from the connection id. */
export const WHATSAPP_MOCK_NUMBER_PREFIX = '1555'
/** A mock phone number id is fifteen digits derived from the connection id, starting here. */
export const WHATSAPP_MOCK_PHONE_ID_BASE = 100_000_000_000_000
/** Random bytes in a mock `wamid.` (as hex, the way Meta's ids carry a 20-character hex message key). */
export const WHATSAPP_MOCK_ID_BYTES = 10
