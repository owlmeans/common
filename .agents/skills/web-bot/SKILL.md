---
name: web-bot
description: How to use @owlmeans/web-bot — the shadcn + Tailwind v4 panels of OwlMeans chat bots (BotConnectionsPanel, BotRulesPanel, BotActivityPanel, BotSimulator), their hooks over a bound @owlmeans/bot surface (useBotConnections, useBotRules, useBotActivity), the write-only credential form, the mock transport and simulator behind allowMock, the eight-language bundle with the BotError copy, the data-bot-* test contract, the mandatory Tailwind @source line, and how a generated target mounts the panels per area. Auto-invoked when building a screen where a person connects a Telegram, WhatsApp, Discord or Slack bot, defines keyword groups, watches bot activity or simulates a message, or when importing from @owlmeans/web-bot.
user-invocable: false
---

# @owlmeans/web-bot

**Layer:** Web (React, shadcn + Tailwind v4)
**Install:** `"@owlmeans/web-bot": "^0.1.18-rc.2"` in `dependencies`
**Contracts:** `@owlmeans/bot` — platforms and their descriptors, connections, rules, activity, the
`makeBotProtocols` tree the panels call, the `BotError` family

## Key Exports

| Export | What it is |
|---|---|
| `BotConnectionsPanel` | `{ surface, platforms?, allowMock?, className? }` — the connections of the surface: status pill, mock badge, bot account, receive mode, last error, setup steps with copy buttons; add / edit (credentials from `BOT_PLATFORMS[platform].credentials`), Verify, enable switch, remove with confirm |
| `BotRulesPanel` | `{ surface, actions, connection?, className? }` — the keyword groups in apply order, and the editor: name, keyword chips, match mode, action (exactly `actions`), reply text (`reply`/`warn`/`record`), instruction (required for `agent`), applies-to, order, enabled, "Try it" through `botRuleHelper.match` |
| `BotActivityPanel` | `{ surface, connection?, className? }` — newest first: time, action, ok/failed pill, mock badge, rule name, target, text excerpt, the refusal; reads again every 5 s while the page is visible; limit 20/50/100/200 |
| `BotSimulator` | `{ surface, connection, className? }` — `connection` is a `BotConnection` or its id; renders NOTHING unless that connection is `transport: 'mock'`. Names the groups the text matches, sends through `connection.simulate`, then polls the activity of that update (45 s) |
| `useBotConnections(surface)` | `{ items, loading, error, reload, save, verify, remove, simulate }` |
| `useBotRules(surface, { connection? })` | `{ items, loading, error, reload, save, remove }` — ordered by `order`; with `connection`, its own groups plus the scope-wide ones |
| `useBotActivity(surface, { connection?, limit?, refreshMs? })` | `{ items, loading, error, reload }` |
| `botErrorHelper` | `keyOf(error)` → the copy key (`credentials-rejected`, `rule-invalid`, `platform-refused` …, `bot`, `generic`), `detailOf(error)` → what followed the marker, `inlinesDetail(key)` → whether the sentence carries the detail itself |
| `botViewHelper` | `platformsOf`, `typedCredentialsOf`, `orderRules`, `ruleInputOf`, `nextOrder`, `formatMoment`, `excerpt`, `setupLineOf`, `discordInviteUrl`, `splitKeywords` |
| `BOT_I18N` | `'bot'` — the library-tier resource (`lib : bot.*`) |
| `BOT_ACTIVITY_LIMITS`, `BOT_ACTIVITY_REFRESH_MS`, `BOT_SIMULATOR_*`, `BOT_DISCORD_PERMISSIONS` | the panel constants (`BOT_DISCORD_PERMISSIONS` `1374389611588` = server-bot's invite bits, threads included) |
| `BotSurface`, `BotOutcome<T>`, `UseBot*`, `Bot*PanelProps`, `BotSimulatorProps` | types |
| `cn` | the class-name merger the components are written against |

## Rules

- **`surface` is a client-bound `BotProtocols` tree.** Every leaf is called as
  `context.entrypoint(surface.<leaf>)`, which resolves by alias — so the undecorated
  `appProtocols.api.bot.operator` works beside a `withIamGuard`-decorated binding. Unbound, the
  first call throws `Entrypoint … not found` into the hook's `error`.
- **Nothing thrown escapes a hook.** A failed read lands in `error` (shown as an alert); every
  operation answers `BotOutcome` — `{ ok, value }` or `{ ok: false, error }` — and the panel shows
  the error where it was started (the dialog, the row). Never wrap a hook call in try/catch.
- **Hooks over one surface stay in step.** A change made through one hook (a saved connection, a
  removed group, a simulated message) makes every other hook over the same base alias read again —
  a screen's own `useBotConnections` list follows the panel without a reload.
- **Credentials are write-only.** The form draws one input per typed credential of the platform
  descriptor (`generated` ones — WhatsApp `verifyToken` — are announced, not asked), masks
  `secret` ones, never shows a saved value back, marks a key in `credentialsSet` as "Set", and sends
  ONLY the keys typed (trimmed). An empty field keeps the stored value.
- **`allowMock`** offers the Live/Mock transport toggle; without it the transport is never sent (a
  new connection is live, an existing one keeps its own). A mock connection needs no credentials
  and shows a mock note instead of setup steps.
- **`platforms`** limits what a NEW connection is made on (one platform: shown, not picked); the
  list shows every connection of the surface.
- **`actions`** is the kit's: the rule editor offers exactly those (plus the one an existing group
  already has). `reply`/`warn` cannot be saved without their text; `agent` not without an instruction.
- Error copy: `errors.<key>` for `@owlmeans/bot`'s five refusals (`connection-not-found`,
  `credentials-rejected`, `signature-rejected`, `transport-mismatch`, `unsupported-action`),
  `@owlmeans/server-bot`'s five (`rule-not-found`, `rule-invalid`, `connection-disabled`,
  `secret-missing`, `credentials-unreadable`), ONE sentence for every platform API error
  (`platform-refused`: "The platform refused: {{detail}}" — `TelegramApiError`, `WhatsAppApiError`,
  `DiscordApiError`, `DiscordGatewayError`, `SlackApiError`), the family `bot` and `generic`. The
  class is read first (`instanceof` for the contract's), then a server-bot `typeName` (mirrored as
  strings — this package never loads server-bot; `src/errors.ts` registers stand-in classes under those
  names so a refusal that crossed the wire is rebuilt with its type and marker), then the
  `bot:<marker>:` prefix (a `receiver:` / `hook:` step prefix of a `lastError` is read past); the detail
  is shown under the sentence, or inside it for `platform-refused`. A `lastError` without a marker is
  the platform's own words, shown as is. The activity panel translates a row by its `code` (the
  marker), falling back to `error` for a row recorded before `code` existed — never by the sentence.
  A new server-bot error class or platform gets its type name and marker added to
  `helpers/error/consts.local.ts` and its copy to all eight languages.
- No colour is hard-coded: pills are `Badge` variants on the app's tokens, rounded-full; a spec
  (`package-boundary.spec.ts`) refuses palette classes and hex values in components.

## The `@source` line — a consumer rule

Tailwind's scanner excludes `node_modules`: without the line, every class used only here never
reaches the stylesheet and the panels render unstyled. Point at the shipped `src`:

```css
@source "../../../node_modules/@owlmeans/web-bot/src";
```

## Translations

Library tier, `lib : bot.*`, registered eagerly by importing the package, in en, pl, ru, be, uk,
es, de and fr (`fr` renders where the app adds it to `cfg.i18n.supportedLngs`). Components read
with `useI18nLib(BOT_I18N, prefix?)`; there is no English literal in the JSX. A new key goes into
all eight files in the same change — `tests/i18n.spec.ts` checks keys, emptiness and placeholders,
and that every key a component asks for exists. An app overrides at the app tier with
`i18nHelper.addI18nApp(lng, 'bot', partial, { ns: LIB_NAMESPACE })`.

## The `data-bot-*` contract

An e2e suite is written against these; renaming one is a breaking change.

| Attribute | Element |
|---|---|
| `data-bot-connections` / `data-bot-rules` / `data-bot-activity` / `data-bot-simulator` | the panel roots (the simulator's also carries `data-bot-connection`) |
| `data-bot-action="add\|save\|verify\|remove\|simulate"` | the primary buttons; also `edit`, `toggle` (enable switch), `confirm-remove`, `cancel`, `copy` (+ `data-bot-copy="hook\|step-N"`), `refresh`, `remove-keyword` |
| `data-bot-field="<key>"` | a credential input, keyed by the descriptor's `key` |
| `data-bot-input="<name>"` | other inputs: `platform`, `label`, `transport`, `name`, `keywords`, `mode`, `action`, `reply`, `instruction`, `connection`, `order`, `enabled`, `try`, `text`, `chat`, `sender`, `chat-kind`, `limit` (selects carry `data-bot-value`, their options and segmented choices `data-bot-option`) |
| `data-bot-connection="<id>"` | a connection row, with `data-bot-platform`, `data-bot-status`, `data-bot-transport`, `data-bot-enabled` |
| `data-bot-rule="<id>"` | a group row, with `data-bot-rule-action`, `data-bot-enabled` |
| `data-bot-activity-item="<id>"` | an activity row, with `data-bot-kind` (the `BotActionKind`), `data-bot-ok`, `data-bot-transport`, `data-bot-update` |
| `data-bot-verified` / `data-bot-verify-error` / `data-bot-last-error` / `data-bot-error="<key>"` | verification outcome, last error, any error note |
| `data-bot-simulator-state="waiting\|reacted\|silent"`, `data-bot-simulator-matches`, `data-bot-rule-try="match\|none"` | simulator and "Try it" results |
| `data-bot-credential-set`, `data-bot-generated`, `data-bot-hint`, `data-bot-invite`, `data-bot-setup-step`, `data-bot-mock`, `data-bot-empty`, `data-bot-loading` | the rest of the surface |

## Target wiring

A generated target (`bot` / `ai-bot` case seed) renders the panels on the screens of the area that
runs the bot:

| Tenancy | Area | `surface` |
|---|---|---|
| none / `operators` | operator area (`/backoffice`) | `appProtocols.api.bot.operator` |
| `users` | user area (`/frontoffice`) | `appProtocols.api.bot.member` |

- `sources/web/package.json`: `"@owlmeans/web-bot": "^0.1.18-rc.2"` (with `@owlmeans/bot` from common).
- `sources/web/src/index.css`, beside the other package lines — BOTH paths, because the installer
  decides where the package lands:

  ```css
  @source "../../../node_modules/@owlmeans/web-bot/src";
  @source "../node_modules/@owlmeans/web-bot/src";
  ```
- `sources/web/src/case.ts` (the seed's): `import '@owlmeans/web-bot'` at the top registers the
  bundle before the first render; the api tree is already client-bound by `bindAll(configuredProtocols.api)`.
- `allowMock = process.env.APP_WORKLOAD !== 'production'` — mock connections and the simulator
  exist in the preview only. The CONNECT screen hosts `BotConnectionsPanel` (its `platforms` = the
  card's `botPlatforms`) and, while `allowMock`, a `BotSimulator` per mock connection
  (`useBotConnections(surface).items.filter(c => c.transport === BotTransport.Mock)`); the RULES
  screen hosts `BotRulesPanel` with the kit's actions (moderation `delete`/`warn`/`mute`/`ban`,
  support `reply`, intake `record`; `agent` where an `ai-bot` group hands the message to the
  agent); the REACT screen, when any, hosts `BotActivityPanel`.

## Depends On

- `@owlmeans/bot` (contracts), `@owlmeans/client` + `@owlmeans/client-entrypoint` (the context
  and the bound calls), `@owlmeans/client-i18n` + `@owlmeans/i18n`, `@owlmeans/error`, `@owlmeans/log`
- Peers (app-provided): `react`, `react-dom`, `tailwindcss`, `tailwind-merge`, `clsx`,
  `class-variance-authority`, `lucide-react`, `@radix-ui/react-{dialog,label,select,slot}`. The
  switch is a plain `role="switch"` button — no `@radix-ui/react-switch`.
- Category D tests: a Vite harness binds a real `makeBotProtocols` surface in a real web context and
  answers the API with `page.route`.

## Related

- [[bot]] — the contract; [[shadcn-web]] — the package boundary and `@source` rule;
  [[web-auth-token]] — the panel + hook precedent; [[localization]] — the eight-language rule
