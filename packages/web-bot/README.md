# @owlmeans/web-bot

The browser half of OwlMeans chat bots — shadcn + Tailwind v4 panels a screen renders over one bound
bot surface (`appProtocols.api.bot.operator` or `.member`), their hooks and their translations. The
contracts they are written against live in `@owlmeans/bot`.

## Overview

- `BotConnectionsPanel({ surface, platforms? })` — connect, verify, switch off and remove the bot accounts (live only; a
  mock connection made through the API for tests shows a badge). The platforms, their credential
  inputs, labels, hints, glyphs and pre-save links are the server's registered descriptors, read once
  per surface through `platform.list`; `platforms` (string ids) narrows what a new connection may use
- `BotActivityPanel({ surface, connection?, refLabel? })` — what the bot did, newest first, refreshed while visible;
  `refLabel(ref)` names the application's own record a row's handler followed (its keyword group)
- `useBotConnections(surface)`, `useBotActivity(surface, { connection?, limit?, refreshMs? })`,
  `useBotPlatforms(surface)` — the I/O half
- `botErrorHelper`, `botViewHelper` — the error-copy keys and the row helpers, for a host that draws its own view
- `cn` — the class-name merger the components are written against

## Installation

```bash
bun add @owlmeans/web-bot@^0.2.2
```

The package ships its own private shadcn primitives and imports them with relative specifiers.
Consumers provide the React, Radix (`dialog`, `label`, `select`, `slot`) and Tailwind peers.

## The `@source` line — required

Tailwind's scanner excludes `node_modules`, so classes that exist only inside this package never
reach the application's stylesheet and the panels render unstyled. Add the package's shipped `src`
directory to the app's Tailwind entry:

```css
@import "tailwindcss";

@source "../../../node_modules/@owlmeans/web-bot/src";
```

The relative depth follows the app's own layout.

## Usage

The surface must be client-bound in the application's context (`bindAll` over its api tree):

```tsx
import { BotActivityPanel, BotConnectionsPanel } from '@owlmeans/web-bot'

const surface = appProtocols.api.bot.operator

{/* `platforms`: the product's platform ids, among those the server registered */}
<BotConnectionsPanel surface={surface} platforms={['chat']} />
{/* `groups`: the application's own keyword-group records, read by the screen */}
<BotActivityPanel surface={surface} refLabel={ref => groups.find(group => group.id === ref)?.name} />
```

This package names no platform: a platform the server has no plugin for is not offered, and a
surface without `platform.list` (a tree restated before the leaf existed) offers none. A refusal
stored before the one platform marker (`bot:<id>:…`) is still explained as the platform's, by the
registered id it starts with.

Keyword groups are not part of this package: an application's groups are its own records with its
own screens, and its bot handler matches messages against them. Test mode (mock connections,
simulated messages) is reached through the API only — no panel offers it.

## Translations

Strings are registered at the library tier as `lib : bot.*` in English, Polish, Russian,
Belarusian, Ukrainian, Spanish, German and French — importing the package registers them. An
application overrides any of them at the app tier, in the library namespace:

```ts
import { i18nHelper, LIB_NAMESPACE } from '@owlmeans/i18n'

i18nHelper.addI18nApp('en', 'bot', { connections: { title: 'Your bots' } }, { ns: LIB_NAMESPACE })
```

A platform's own texts (credential labels and hints, its setup hint, its link) are not here: they
travel in its descriptor, per language, and fall back to English.

## API

| Export | Description |
|---|---|
| `BotConnectionsPanel` | `{ surface, platforms?, className? }` — connect, verify, switch off and remove bot accounts |
| `BotActivityPanel` | `{ surface, connection?, refLabel?, className? }` — what the bot did, newest first, refreshed while visible |
| `useBotConnections(surface)` | `{ items, loading, error, reload, save, verify, remove }`; operations answer a `BotOutcome`, never throw |
| `useBotActivity(surface, { connection?, limit?, refreshMs? }?)` | `{ items, loading, error, reload }`, newest first |
| `useBotPlatforms(surface)` | `{ items, loading, error, reload, descriptorOf }` — the server's registered descriptors from `platform.list` |
| `createBotErrorHelper()`, `botErrorHelper` | `keyOf(error, platforms?)`, `detailOf(error)`, `inlinesDetail(key)` — the copy key and detail of a bot failure |
| `createBotViewHelper()`, `botViewHelper` | `platformsOf`, `typedCredentialsOf`, `textOf`, `linkOf`, `formatMoment`, `excerpt`, `setupLineOf` — descriptor and row helpers for a host that draws its own view |
| `cn` | The class-name merger the components use |
| `BOT_I18N` | `'bot'` — the i18n resource (`lib : bot.*`) |
| `BOT_ACTIVITY_REFRESH_MS`, `BOT_ACTIVITY_LIMITS`, `BOT_EXCERPT_MAX` | `5_000`, the offered page sizes `[20, 50, 100, 200]`, `160` |
| `BotSurface`, `BotOutcome`, `UseBotConnections`, `UseBotPlatforms`, `UseBotActivity`, `BotActivityOptions`, `BotConnectionsPanelProps`, `BotActivityPanelProps`, `BotRefLabel`, `BotErrorKey`, `BotErrorHelper`, `BotViewHelper`, `BotSetupLine` | Types |

## Related packages

- [`@owlmeans/bot`](../bot) — the contract: the managing protocol trees, platform descriptors, connections and errors
- [`@owlmeans/server-bot`](../server-bot) — the server runtime; `serveBotEntrypoints` serves the surface, `platform.list` included
- [`@owlmeans/bot-agent`](../bot-agent) — lets an agent act on a bot message; its actions show in the activity panel
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — `bindAll`, which binds the surface in the client context
- The platform plugins `@owlmeans/bot-telegram`, `bot-whatsapp`, `bot-discord` and `bot-slack` live in [OwlMeans connect](https://github.com/owlmeans/connect); their descriptors are what the panels draw

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.2
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
