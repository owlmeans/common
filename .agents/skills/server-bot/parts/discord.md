---
name: discord
description: The Discord plugin — the REST calls each step makes, the invite URL and permission bits, rate-limit retries, the gateway receiver (heartbeat, identify, resume, close codes, fatal faults), its normalization and addressing rules, and its mock REST routes and fake gateway socket.
metadata:
  purposes: server-api, test
  mentions: makeDiscordBotPlatform, discordBotPlatform, discordSetupHelper, DISCORD_PERMISSIONS, DiscordApiError, DiscordGatewayError, DISCORD_FATAL_CLOSE_CODES, makeDiscordGateway, DiscordMock
---

# @owlmeans/server-bot — Discord (REST API v10 + gateway)

The plugin interface, the rules every plugin follows and the mock transport are the [platforms](platforms.md) part.

Docs (discord.com/developers/docs redirects to docs.discord.com/developers): …/reference (base
`https://discord.com/api/v10`, `Authorization: Bot <token>`, a required `User-Agent: DiscordBot ($url,
$version)`, snowflakes: epoch 1420070400000, `id >> 22` = ms, ids are strings), …/topics/rate-limits
(429 body `{ message, retry_after (s, float), global, code? }` + `Retry-After`; 10 000 401/403/429 per
10 min ban the IP; 50 req/s global), …/events/gateway (connect, heartbeat, identify, resume, intents),
…/events/gateway-events (payload `{ op, d, s, t }`, READY, MESSAGE_CREATE/UPDATE extra fields
`guild_id`, `member`), …/topics/opcodes-and-status-codes (opcodes, close codes, JSON error codes),
…/resources/message (create/delete message, reactions, `message_reference`, `allowed_mentions`, types
DEFAULT 0 / REPLY 19), …/resources/guild (Modify Guild Member, Create Guild Ban), …/resources/user,
…/topics/permissions, …/topics/oauth2 (bot invite URL). Calls are `<method> <base><route>` with JSON;
a 204 is `undefined`; a refusal `{ code, message, errors? }` → `DiscordApiError`
`bot:discord:<status>:<json code>:<message>` (`status`, `code`, `retryAfter`). `base` defaults to
`https://discord.com/api/v10` (`makeDiscordBotPlatform({ base, socket, reconnectMs = 1000, userAgent })`).
A 429 waits `retry_after` and retries ≤ 3 times while each wait ≤ 10 s, else fails 429 with `retryAfter`.

| Plugin step | Discord | Notes |
|---|---|---|
| verify | `GET /users/@me` → `{ id, username, name: global_name }` | 401/403 → `BotCredentialsRejected` (`discord:<status>`) |
| registerHook | — (`setup: 'auto'`, receive `gateway` only) | Discord posts no message webhooks; verify leaves `receive: gateway` |
| setup | invite `https://discord.com/oauth2/authorize?client_id=<applicationId>&scope=bot&permissions=1374389611588` | `discordSetupHelper` (`inviteUrl`, `permissions`, `steps`); the bits (`DISCORD_PERMISSIONS`): VIEW_CHANNEL 1<<10, SEND_MESSAGES 1<<11, SEND_MESSAGES_IN_THREADS 1<<38 (a reply to a thread message), MANAGE_MESSAGES 1<<13 (delete others'), READ_MESSAGE_HISTORY 1<<16 (replies, reactions), ADD_REACTIONS 1<<6, MODERATE_MEMBERS 1<<40 (timeout), BAN_MEMBERS 1<<2 — `@owlmeans/web-bot`'s `BOT_DISCORD_PERMISSIONS` is the same number; the MESSAGE CONTENT privileged intent must be on (Developer Portal → Bot), and the bot's role above the members it moderates |
| authenticate | — | rejects EVERY hook request, live or mock (`gateway-only`): Discord posts no message webhooks, and `simulate` does not use the hook. Interaction (Ed25519) requests are not handled: no public-key credential |
| receiver | `GET /gateway/bot` → `url` (refused when `session_start_limit.remaining` is 0), then the socket `?v=10&encoding=json` | see the gateway below; `fatal`: a `DiscordGatewayError` whose code is in `DISCORD_FATAL_CLOSE_CODES` (4004 4010–4014) or a `DiscordApiError` 401 — `0:unreachable`, a spent session-start limit and other REST faults are retried |
| reply | `POST /channels/{chat}/messages { content, message_reference: { type: 0, message_id, channel_id, guild_id?, fail_if_not_exists: false }, allowed_mentions: { parse: ['users'], replied_user: true } }` | content ≤ 2000 (clipped); never pings `@everyone` or a role; the created ref keeps `space` |
| send | `POST /channels/{chat}/messages { content, allowed_mentions: { parse: ['users'] } }` | |
| delete | `DELETE /channels/{chat}/messages/{id}` → 204 | others' messages need MANAGE_MESSAGES; a DM's only the bot's own |
| mute | `PATCH /guilds/{space}/members/{user} { communication_disabled_until: ISO }` | a timeout, capped at now + 28 days (minus a minute); 403 on an administrator or the owner |
| ban | `PUT /guilds/{space}/bans/{user} {}` → 204 | |
| react | `PUT /channels/{chat}/messages/{id}/reactions/{urlencoded emoji}/@me` → 204 | `<:name:id>` / `<a:name:id>` is sent as `name:id`; Unicode as itself |

Mute and ban need the guild: `space` of the update's chat (or of the member target); none (a DM, a
bare chat id) → `act` throws `bot:invalid-action:no-guild:<kind>` → `{ ok: false }`. Ids go into paths
URL-encoded.

**Gateway** (`makeDiscordGateway`, one per receiver run; logger `server-bot:discord`, debug only):
Hello (op 10) → heartbeat op 1 `d` = last sequence received, first beat after `interval × random`,
then every interval; a beat whose predecessor got no op 11 = zombie → close 4200 and resume. Then op 2
Identify `{ token, intents: 37377 (GUILDS 1 | GUILD_MESSAGES 1<<9 | DIRECT_MESSAGES 1<<12 |
MESSAGE_CONTENT 1<<15), properties: { os, browser: 'owlmeans', device: 'owlmeans' } }`, or with a
session from READY op 6 Resume `{ token, session_id, seq }` on READY's `resume_gateway_url` (no
`/gateway/bot` call). Dispatches are handled in order; `MESSAGE_CREATE` / `MESSAGE_UPDATE` are
`emit`ted (awaited) and only a handled dispatch moves the `seq` a resume replays after — a refused
emit closes 4200 and resumes from it. Op 1 from the server → beat at once; op 7 → close 4200, resume
at once; op 9 → wait 1–5 × `reconnectMs`, resume (`d: true`) or identify anew; a drop or another
close → resume after a backoff (`reconnectMs` doubling to 30 s), 4007/4009 → identify anew;
4004 4010 4011 4012 4013 4014 → `DiscordGatewayError` `bot:discord-gateway:<code>:<reason>`
(`authentication-failed`, `disallowed-intents` = MESSAGE CONTENT off, …), no retry; 5 consecutive
connections that never reached READY/RESUMED cleanly → the last fault or `0:unreachable`. No Hello in
30 s → reconnect. Abort → close 1000 (ends the session) and return. No sharding (> 2500 guilds → 4011).

Normalization (a gateway frame `{ op: 0, t, d }`): `MESSAGE_CREATE` → `message` / `command`;
`MESSAGE_UPDATE` with `edited_timestamp` → `edited` (`platformId` `<id>:<edited_timestamp>`), without
one (an embed unfurl) → none; message types other than 0 / 19 (joins, pins, boosts) → none; the bot's
own messages (`author.id` = `identity.id`) → none; other events → none. Chat = `channel_id`, `group`
with `space` = `guild_id`, or `private` without a guild (no title: the payload has no channel name;
a thread is its own channel). Sender = `author` (`name` = `global_name`, `bot`). `replyTo` only for
type 19 with a DEFAULT reference (a forward is none): reference ids + `referenced_message` text and
author. `addressed`: a DM, the bot in `mentions` or `<@id>` / `<@!id>` in the content, or a reply to
the bot's message. Command via `botCommandHelper.parse(content, identity.username)`.

Mock (`discordBotPlatform.mock`, a `DiscordMock`): REST routes recorded under the docs' endpoint
names with path params + body (`getCurrentUser`, `getGatewayBot`, `createMessage`, `deleteMessage`,
`createReaction` with the decoded `emoji`, `modifyGuildMember`, `createGuildBan`); the bot user id is
the `applicationId` when it is a snowflake (`userIdOf`), its username `mock_<id>_bot`; messages get
real, increasing snowflakes (now + random low 22 bits, inbound ones too); refusals as the API words them (50006 empty, 50035 too long / a timeout
past 28 days, 10014 empty emoji, 404/405). The gateway is an in-process fake socket
(`mock.socket(connection)`, chosen by the receiver for a mock session): Hello, READY on Identify
(recorded `gateway:identify` without the token), RESUMED on Resume, op 11 per beat, unknown op →
close 4001; `gateway:connect` records the URL. `feed(connection, frame | message)` delivers to the
identified socket or queues until one identifies. `inbound` builds a real `MESSAGE_CREATE` frame
(guild `space` for group/channel kinds, none for private; non-numeric ids map to stable snowflakes;
`@<bot username>` → `<@id>` + `mentions`; `replyTo` → type 19 + `referenced_message`, from the bot
when the fake API sent that id), unsigned — `simulate` hands it to `normalize` and the inbox, and the
fake gateway delivers what `feed` queues. `reset` closes the fake sockets (4000).
