---
name: web-bot
description: How to use @owlmeans/web-bot — the shadcn + Tailwind v4 panels of OwlMeans chat bots (BotConnectionsPanel, BotActivityPanel with its refLabel), their hooks over a bound @owlmeans/bot surface (useBotConnections, useBotActivity), the write-only credential form (live connections only — no test mode in any UI; a mock connection made through the API shows a display-only badge), the eight-language bundle with the BotError copy, the data-bot-* test contract, the mandatory Tailwind @source line, and how a generated target mounts the panels per area beside its own generated keyword-group screens. Auto-invoked when building a screen where a person connects a Telegram, WhatsApp, Discord or Slack bot or watches bot activity, or when importing from @owlmeans/web-bot.
user-invocable: false
---

# @owlmeans/web-bot

**Layer:** Web (React, shadcn + Tailwind v4)
**Install:** `"@owlmeans/web-bot": "^0.1.18"` in `dependencies`
**Contracts:** `@owlmeans/bot` — platforms and their descriptors, connections, activity, the
`makeBotProtocols` tree the panels call, the `BotError` family

Two stock panels: where a person CONNECTS a bot, and what the bot DID. Nothing here edits keyword
groups or tests a bot: an application's keyword groups are its own generated records and screens,
and a mock connection or a simulated message exists only through the API (tests, the runtime smoke).

## Key Exports

| Export | What it is |
|---|---|
| `BotConnectionsPanel` | `{ surface, platforms?, className? }` — the connections of the surface: status pill, bot account, receive mode, last error, setup steps with copy buttons, a display-only mock badge on a connection made as mock through the API; add / edit (credentials from `BOT_PLATFORMS[platform].credentials`), Verify, enable switch, remove with confirm |
| `BotActivityPanel` | `{ surface, connection?, refLabel?, className? }` — newest first: time, action, ok/failed pill, mock badge, the row's `ref` named by `refLabel(ref)` (nothing without it, or when it answers `undefined`), connection label, target, text excerpt, the refusal; reads again every 5 s while the page is visible; limit 20/50/100/200 |
| `useBotConnections(surface)` | `{ items, loading, error, reload, save, verify, remove }` |
| `useBotActivity(surface, { connection?, limit?, refreshMs? })` | `{ items, loading, error, reload }` |
| `botErrorHelper` | `keyOf(error)` → the copy key (`credentials-rejected`, `connection-disabled`, `platform-refused` …, `bot`, `generic`), `detailOf(error)` → what followed the marker, `inlinesDetail(key)` → whether the sentence carries the detail itself |
| `botViewHelper` | `platformsOf`, `typedCredentialsOf`, `formatMoment`, `excerpt`, `setupLineOf`, `discordInviteUrl` |
| `BOT_I18N` | `'bot'` — the library-tier resource (`lib : bot.*`) |
| `BOT_ACTIVITY_LIMITS`, `BOT_ACTIVITY_REFRESH_MS`, `BOT_EXCERPT_MAX`, `BOT_DISCORD_PERMISSIONS` | the panel constants (`BOT_DISCORD_PERMISSIONS` `1374389611588` = server-bot's invite bits, threads included) |
| `BotSurface`, `BotOutcome<T>`, `UseBot*`, `Bot*PanelProps`, `BotRefLabel` | types |
| `cn` | the class-name merger the components are written against |

## Rules

- **`surface` is a client-bound `BotProtocols` tree.** Every leaf is called as
  `context.entrypoint(surface.<leaf>)`, which resolves by alias — so the undecorated
  `appProtocols.api.bot.operator` works beside a `withIamGuard`-decorated binding. Unbound, the
  first call throws `Entrypoint … not found` into the hook's `error`.
- **Nothing thrown escapes a hook.** A failed read lands in `error` (shown as an alert); every
  operation answers `BotOutcome` — `{ ok, value }` or `{ ok: false, error }` — and the panel shows
  the error where it was started (the dialog, the row). Never wrap a hook call in try/catch.
- **Hooks over one surface stay in step.** A change made through one hook (a saved, verified or
  removed connection) makes every other hook over the same base alias read again — a screen's own
  `useBotConnections` list and the activity panel's connection labels follow without a reload.
- **Credentials are write-only.** The form draws one input per typed credential of the platform
  descriptor (`generated` ones — WhatsApp `verifyToken` — are announced, not asked), masks
  `secret` ones, never shows a saved value back, marks a key in `credentialsSet` as "Set", and sends
  ONLY the keys typed (trimmed). An empty field keeps the stored value.
- **No test mode in the UI.** The form offers no transport and never sends one: a new connection is
  live, an existing one keeps its own. Its required credentials are always asked for. A connection
  made as mock through the API (the runtime smoke, e2e) is drawn with a `data-bot-mock` badge and no
  setup steps — nothing more; no panel simulates a message.
- **`platforms`** limits what a NEW connection is made on (one platform: shown, not picked); the
  list shows every connection of the surface.
- **`refLabel`** is the screen's: given a row's opaque `ref` (the id of the application's own record
  the handler followed — its keyword group), it answers the name to show, or `undefined` for none.
  The panel reads nothing else to resolve it; without the prop no row shows its ref.
- Error copy: `errors.<key>` for `@owlmeans/bot`'s five refusals (`connection-not-found`,
  `credentials-rejected`, `signature-rejected`, `transport-mismatch`, `unsupported-action`),
  `@owlmeans/server-bot`'s three (`connection-disabled`, `secret-missing`, `credentials-unreadable`), ONE sentence for every platform API error
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
that every key a component asks for exists, and that no keyword-group, simulator or transport-choice
copy ships. An app overrides at the app tier with
`i18nHelper.addI18nApp(lng, 'bot', partial, { ns: LIB_NAMESPACE })`.

## The `data-bot-*` contract

An e2e suite is written against these; renaming one is a breaking change.

| Attribute | Element |
|---|---|
| `data-bot-connections` / `data-bot-activity` | the panel roots; `data-bot-connection-form` the connect dialog |
| `data-bot-action="add\|save\|verify\|remove"` | the primary buttons; also `edit`, `toggle` (enable switch), `confirm-remove`, `cancel`, `copy` (+ `data-bot-copy="hook\|step-N"`), `refresh` |
| `data-bot-field="<key>"` | a credential input, keyed by the descriptor's `key` |
| `data-bot-input="<name>"` | other inputs: `platform`, `label`, `limit` (selects carry `data-bot-value`, their options `data-bot-option`) |
| `data-bot-connection="<id>"` | a connection row, with `data-bot-platform`, `data-bot-status`, `data-bot-transport`, `data-bot-enabled` |
| `data-bot-activity-item="<id>"` | an activity row, with `data-bot-kind` (the `BotActionKind`), `data-bot-ok`, `data-bot-transport`, `data-bot-update`; inside it `data-bot-activity-ref="<ref>"` (only when `refLabel` names it), `data-bot-activity-text`, `data-bot-result` |
| `data-bot-verified` / `data-bot-verify-error` / `data-bot-last-error` / `data-bot-error="<key>"` | verification outcome, last error, any error note |
| `data-bot-credential-set`, `data-bot-generated`, `data-bot-hint`, `data-bot-invite`, `data-bot-setup-step`, `data-bot-mock`, `data-bot-empty`, `data-bot-loading` | the rest of the surface |

## Target wiring

A generated target (`bot` / `ai-bot` case seed) renders the panels on the screens of the area that
runs the bot:

| Tenancy | Area | `surface` |
|---|---|---|
| none / `operators` | operator area (`/backoffice`) | `appProtocols.api.bot.operator` |
| `users` | user area (`/frontoffice`) | `appProtocols.api.bot.member` |

- `sources/web/package.json`: `"@owlmeans/web-bot": "^0.1.18"` (with `@owlmeans/bot` from common).
- `sources/web/src/index.css`, beside the other package lines — BOTH paths, because the installer
  decides where the package lands:

  ```css
  @source "../../../node_modules/@owlmeans/web-bot/src";
  @source "../node_modules/@owlmeans/web-bot/src";
  ```
- `sources/web/src/case.ts` (the seed's): `import '@owlmeans/web-bot'` at the top registers the
  bundle before the first render; the api tree is already client-bound by `bindAll(configuredProtocols.api)`.
- The CONNECT screen hosts `BotConnectionsPanel` (its `platforms` = the card's `botPlatforms`) —
  the connection dialog, live connections only. No screen hosts a transport choice or a message
  simulator: test mode is API-only.
- The keyword groups are the target's OWN generated product type — collection and form screens over
  its generated API, like any record (name, keywords, the kit's action or reply text, `enabled`,
  an `instruction` for an AI bot). Its keyword inputs normalize with `botTextHelper.phrasesOf`
  (`@owlmeans/bot`); nothing of this package draws or stores them.
- The REACT screen, when any, hosts `BotActivityPanel` with
  `refLabel={ref => groups.find(group => group.id === ref)?.name}` over the screen's own list of
  keyword groups, so a row names the group its handler followed (`{ ref: group.id }`).

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
