---
name: telegram
description: The Telegram plugin — the Bot API calls each step makes (getMe, setWebhook, getUpdates, sendMessage, deleteMessage, restrictChatMember, banChatMember, setMessageReaction), its secret-token hook, its fatal codes, its normalization and addressing rules, and privacy mode in groups.
metadata:
  purposes: server-api, test
  mentions: makeTelegramBotPlatform, telegramBotPlatform, TelegramApiError, TELEGRAM_FATAL_CODES
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-bot — Telegram (Bot API)

The plugin interface, the rules every plugin follows and the mock transport are the [platforms](platforms.md) part.

Docs: https://core.telegram.org/bots/api (methods, `Update` and `Message` types, `ReplyParameters`, `ChatPermissions`, `ReactionTypeEmoji`). Calls are
`POST <base>/bot<token>/<method>` with JSON; every answer is `{ ok, result }` or
`{ ok: false, error_code, description, parameters?: { retry_after } }` (`TelegramApiError`,
`bot:telegram:<code>:<description>`). `base` defaults to `https://api.telegram.org`
(`makeTelegramBotPlatform({ base })` for a self-hosted Bot API server).

| Plugin step | Bot API | Notes |
|---|---|---|
| verify | `getMe` → `User` | 401/404 (`TELEGRAM_FATAL_CODES`) → `BotCredentialsRejected` |
| registerHook | `setWebhook { url, secret_token, allowed_updates: [message, edited_message, channel_post] }` | ports 443/80/88/8443; `secret_token` 1–256 of `A-Za-z0-9_-` — the hook secret is base64url |
| authenticate | header `X-Telegram-Bot-Api-Secret-Token` | timing-safe against `hookSecret`; anything but POST is rejected |
| receiver | `deleteWebhook`, then `getUpdates { offset, timeout: 25, allowed_updates }` | `getUpdates` refuses while a webhook is set; `offset` = last `update_id` + 1 confirms; `fatal`: a `TelegramApiError` 401/404 (revoked token, deleted bot) — 409 (another poller) and transport faults are retried |
| reply / send | `sendMessage { chat_id, text, message_thread_id?, reply_parameters: { message_id, allow_sending_without_reply } }` | text 1–4096 (clipped) |
| delete | `deleteMessage { chat_id, message_id }` | only messages < 48 h old; the bot needs admin rights in groups |
| mute | `restrictChatMember { chat_id, user_id, permissions (every send false), use_independent_chat_permissions: true, until_date }` | supergroups only; > 366 days or < 30 s means forever |
| ban | `banChatMember { chat_id, user_id }` | |
| react | `setMessageReaction { chat_id, message_id, reaction: [{ type: 'emoji', emoji }] }` | one reaction for a non-premium bot |

Normalization: `message` / `edited_message` / `channel_post` (`edited_channel_post` too) → chat kind
(`private`; `group` and `supergroup` → `group`; `channel`), sender (`sender_chat` when the message was
sent on behalf of a chat, else `from`), text or caption, `reply_to_message`, the command via
`botCommandHelper.parse(text, botUsername)`, a forum topic's `message_thread_id` as `thread` (only
when `is_topic_message`). `addressed`: a private chat, a `mention` entity of `@<bot>` (offsets are
UTF-16, as JS indices), a `text_mention` of the bot, `/cmd@<bot>`, or a reply to the bot. Ids are
text in the contract and numbers on the wire (chat ids fit 52 bits).

The mock's `update_id` and `message_id` (inbound and `sendMessage`) start at a random point of the
signed 32-bit range per connection state (`TELEGRAM_ID_MAX`, `TELEGRAM_MOCK_ID_HEADROOM`) and count
up — sequential within a lifetime (`getUpdates` offsets work), never re-minted by a restart.

A group bot sees every message only as an administrator or with privacy mode off (@BotFather
`/setprivacy`); the connection's `setup` steps say so.
