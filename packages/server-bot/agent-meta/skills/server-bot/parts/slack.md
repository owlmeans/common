---
name: slack
description: The Slack plugin — the Web API calls each step makes, the signing-secret signature and url_verification handshake, the admin user token for delete, emoji names, 429 retries, its normalization, dedupe key and addressing rules, and its mock workspace, signed inbound and challenge.
metadata:
  purposes: server-api, test
  mentions: makeSlackBotPlatform, slackBotPlatform, SlackApiError, SLACK_EMOJI_NAMES, slackSignatureHelper
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-bot — Slack (Events API + Web API)

The plugin interface, the rules every plugin follows and the mock transport are the [platforms](platforms.md) part.

Docs (moved from api.slack.com to docs.slack.dev, which the old URLs redirect to):
https://docs.slack.dev/apis/events-api/ (envelope, retries, 3 s answer, 30 000 events/workspace/app/h),
https://docs.slack.dev/authentication/verifying-requests-from-slack (signature),
https://docs.slack.dev/reference/events/url_verification (handshake: answer `{"challenge"}` as JSON,
form or text), https://docs.slack.dev/reference/events/message (subtypes, `edited`) and
…/message/message_changed, https://docs.slack.dev/reference/events/app_mention (`app_mentions:read`; no
event in DMs or in channels the app is not in), https://docs.slack.dev/reference/methods/{auth.test,
chat.postMessage, chat.delete, reactions.add}, https://docs.slack.dev/apis/web-api/rate-limits (HTTP 429
+ `Retry-After` seconds, per method and workspace), https://docs.slack.dev/messaging/formatting-message-text/
(`& < >` escaping). Calls are `POST <base>/<method>`, `Authorization: Bearer <token>`, JSON
(`application/json; charset=utf-8`); every answer is `{ ok, error?, warning? }`, `ok: false` →
`SlackApiError` `bot:slack:<method>:<error>` (`method`, `code`, `retryAfter`). `base` defaults to
`https://slack.com/api` (`makeSlackBotPlatform({ base, retries = 2, maxRetryWaitS = 30 })`): a 429 is
retried after its `Retry-After` at most `retries` times and never when the wait exceeds the bound —
then the call fails `ratelimited`.

| Plugin step | Slack | Notes |
|---|---|---|
| verify | `auth.test` (bot token) → `{ id: user_id, username: user, name: team }` | live needs `botToken` + `signingSecret`; `invalid_auth` `not_authed` `account_inactive` `token_revoked` `token_expired` `not_allowed_token_type` → `BotCredentialsRejected`; no `bot_id` → not a bot token |
| verify (admin) | `auth.test` with `userToken` when set | must be a user token (no `bot_id`) of the SAME `team_id` |
| setup | manual | scopes `chat:write channels:history groups:history im:history app_mentions:read reactions:write`; bot events `message.channels message.groups message.im app_mention`; Request URL = `hookUrl`; invite the bot; optional admin user token (user scope `chat:write`) for delete. Credentials are saved BEFORE the URL: Slack sends `url_verification` at once |
| authenticate | `X-Slack-Signature` = `v0=` hex HMAC-SHA256(signingSecret, `v0:<X-Slack-Request-Timestamp>:<raw body>`) | timing-safe; timestamp ±300 s; POST only; then `url_verification` → `{ result: 'challenge', reply: { challenge } }` (signed like any event). A MOCK connection also accepts its `hookSecret`; a live one never |
| reply | `chat.postMessage { channel, text, thread_ts: to.thread ?? to.id }` | always in the thread; the created ref keeps the thread |
| send | `chat.postMessage { channel, text, thread_ts? }` | text clipped to 40 000, then `& < >` escaped (plain text stays literal) |
| delete | `chat.delete { channel, ts }` with the `userToken` | a bot token deletes only the bot's own posts; without `userToken` the plugin throws `BotUnsupportedAction` (the descriptor already hides `delete`) |
| react | `reactions.add { channel, timestamp, name }` | a name, colons stripped; common Unicode emoji map to names (`SLACK_EMOJI_NAMES`: 👍 `+1`, 👎 `-1`, ⚠️ `warning` …), others go as given (`invalid_name`) |
| mute / ban | — | `BotUnsupportedAction` |

Normalization (`event_callback` only; `url_verification`, `app_rate_limited` and other events → none):
`message` with no subtype or `thread_broadcast` / `file_share` / `me_message` → `message`/`command`;
`message_changed` → `edited` only when its `message` carries text that changed (`edited` set, or the
text differs from `previous_message`) — metadata/unfurl changes are ignored; every other subtype
(`bot_message`, `message_deleted`, `channel_join` …) and the bot's own posts (`user` = the bot user,
or `bot_id` with this app's `app_id` / `bot_profile.app_id` = `api_app_id`) → none. Another app's bot
is kept with `sender.bot`. `app_mention` → a message, `addressed`. Chat = `channel`, `private` for
`channel_type: 'im'` (or a `D…` id — `app_mention` has no type), else `group`; `space` = `team_id`;
`thread` = `thread_ts`; message id = `ts`; `replyTo` = the parent (`thread_ts` ≠ `ts`, sender
`parent_user_id`); sender = `user` (`user_profile` / `bot_profile` names when delivered); text decoded
(`&amp; &lt; &gt;`); command via `botCommandHelper.parse` on the text. `addressed`: a DM, an
`app_mention`, `<@BOTID>` (or `<@BOTID|name>`) in the ESCAPED text, or a thread reply under the bot's
post. The bot id is `identity.id`, else the envelope's `authorizations[].user_id` with `is_bot`.

`platformId` = `<channel>:<ts>` (an edit: `<channel>:<ts>:edited:<edited.ts>`), not `event_id`: Slack
re-signs a retry (`X-Slack-Retry-Num` 1–3, ~now, +1 min, +5 min) with the same message, AND sends one
mention twice (`message.*` and `app_mention`, different `event_id`s) — one key stores both once.

Slash commands (`/cmd` registered in the app) are a separate form-encoded flow with its own
`response_url` — not handled; a `/word` typed as a message is parsed as a command like any text.

Mock: `auth.test` answers a stable fake workspace/app/bot per connection id
(`slackBotPlatform.mock.identityOf(id)`: `teamId`, `appId`, `botId`, `botUserId`, `username`
`mock_<id>_bot`, `adminUserId`) — the admin for the connection's `userToken`; `chat.postMessage` answers
`{ ok, channel, ts, message }` with increasing `ts` (`<s>.<µs>`, now with random sub-millisecond µs; inbound too, `event_id` random), `no_text` / `channel_not_found`;
`chat.delete` lets the bot token delete its own posts and the user token anyone's
(`cant_delete_message` otherwise); `reactions.add` refuses `:name:` and Unicode (`invalid_name`) and a
repeat (`already_reacted`); every call is a `BotMockCall` with `auth` `bot | user | none`.
`inbound` builds a real `event_callback` (`message`, `channel_type` `channel`, or `im` in a `D…` channel
for a private chat; `replyTo`/`thread` → `thread_ts` + `parent_user_id`; `@<bot username>` → `<@U…>`;
`& < >` escaped) signed NOW with `signingSecret`, else the `hookSecret`; `mock.challenge(connection,
value?)` builds a signed `url_verification`. Slack has no receiver: `mock.feed` throws.
`slackSignatureHelper.sign(secret, timestamp, body)` signs a hand-made payload.
