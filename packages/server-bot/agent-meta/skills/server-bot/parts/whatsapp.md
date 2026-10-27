---
name: whatsapp
description: The WhatsApp plugin — the Cloud API calls each step makes, the verify-token handshake and app-secret signature, manual setup and the one-callback-per-app rule, its normalization, its mock (phone number ids, wamids, signed inbound, challenge) and the unused per-number callback override.
metadata:
  purposes: server-api, test
  mentions: makeWhatsAppBotPlatform, whatsappBotPlatform, WhatsAppApiError, WhatsAppMock
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-bot — WhatsApp (Cloud API)

The plugin interface, the rules every plugin follows and the mock transport are the [platforms](platforms.md) part.

Docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint
(handshake + signature), …/webhooks/reference/messages (`text`, `interactive`, `button` payloads),
…/messages/text-messages, …/messages/contextual-replies, …/messages/reaction-messages,
…/business-phone-numbers/phone-numbers, …/support/error-codes (all under
`https://developers.facebook.com/documentation/business-messaging/whatsapp/`). Calls go to
`<base>/<version>/…` with `Authorization: Bearer <accessToken>`; `base` defaults to
`https://graph.facebook.com`, `version` to `v26.0` (`makeWhatsAppBotPlatform({ base, version })`).
A refusal is `{ error: { message, type, code, error_subcode?, fbtrace_id } }` → `WhatsAppApiError`
`bot:whatsapp:<code>:<message>` (`code` = Graph code, `status` = HTTP status; build on `code`, not
the HTTP status — Meta's advice).

| Plugin step | Cloud API | Notes |
|---|---|---|
| verify | `GET /<phoneNumberId>?fields=display_phone_number,verified_name` | identity: id = phone number id, `name` = verified name, `username` = display number; codes 0 3 10 100 190 or HTTP 401/403/404 → `BotCredentialsRejected` |
| registerHook | — (`setup: 'manual'`) | `setup` steps: callback URL = `hookUrl`, verify token, subscribe to `messages`, a permanent System User token, one app per number, the 24-hour window |
| authenticate GET | `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge` | token timing-safe against `verifyToken` (default: the hook secret) → `{ result: 'challenge', text: <hub.challenge> }`; else reject (`hub-mode`, `verify-token`, `hub-challenge`) |
| authenticate POST | `X-Hub-Signature-256: sha256=<hex HMAC-SHA256(appSecret, raw body)>` | over `rawBody` (Meta escapes non-ASCII as `\uXXXX`: a re-serialized body does not verify); no app secret → reject, except a MOCK connection, which signs with its hook secret |
| reply | `POST /<phoneNumberId>/messages { messaging_product: 'whatsapp', recipient_type: 'individual', to, context: { message_id }, type: 'text', text: { body } }` | body ≤ 4096 (clipped); the created message = `messages[0].id` |
| send | the same without `context` | `to` = the chat id = the customer's `wa_id` |
| react | `{ …, type: 'reaction', reaction: { message_id, emoji } }` | only to a customer's message ≤ 30 days old; a failure arrives later as a status webhook (131009) |
| delete / mute / ban | — | not in the descriptor; `act` throws `BotUnsupportedAction` defensively |

Normalization: `object: 'whatsapp_business_account'` → every `entry[].changes[]` with `field:
'messages'` → every `value.messages[]`: `text.body`; `interactive.button_reply.title` /
`list_reply.title`; a template quick reply `button.text`; an `image`/`video`/`document` caption.
Other kinds (reaction, sticker, location, `unsupported` …) and `statuses[]` (delivery receipts) give
no update. Chat = `{ id: from, kind: private, title: profile name }` (Cloud API messages are
one-to-one), sender from `contacts[]` by `wa_id`, `addressed: true`, `platformId` = the `wamid`, a
leading `/cmd` is a command. `context.id` → `replyTo` (its sender is the bot when `context.from` is
the business display number); a `forwarded` context is no reply and carries no quoted text. A change
whose `metadata.phone_number_id` differs from the verified identity is ignored: one Meta app posts
every number's messages to ONE callback URL, so a connection keeps only its own number's. Meta
batches and retries for up to 7 days — the inbox's dedupe on the `wamid` absorbs that.

Mock (`whatsappBotPlatform.mock`, a `WhatsAppMock`): the phone number id is `phoneNumberId` or 15
digits derived from the connection id (`phoneNumberIdOf`), the display number `1555…`
(`displayNumberOf`), the verified name the connection's label. Calls are recorded as `phone-number`
(params = the query) and `messages` (params = the JSON body); a text or reaction answers a fresh
random `wamid.…` (inbound ones too), a bad body or another number id the Graph `{ error }` (code 100, subcode 33). `inbound`
writes Meta's payload for `input.text` from `input.sender.id` (a phone number stays itself; default
`15551230001`), `replyTo` as `context` (from the business when the fake API sent that id), signed
with the app secret or else the hook secret. `challenge(connection, { challenge?, verifyToken? })`
builds the GET handshake. `feed` only keeps the payload — WhatsApp has no receiver.

Not used (the contract says `setup: 'manual'`): Meta's per-number callback override, `POST
/<phoneNumberId> { webhook_configuration: { override_callback_uri, verify_token } }` (…/webhooks/override;
precedence number → business account → app), would let `registerHook` set the hook itself and lift
the one-app-per-number limit.
