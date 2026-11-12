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
bun add @owlmeans/web-bot@^0.2.0-alpha.0
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

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.0
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
