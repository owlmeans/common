# @owlmeans/web-bot

The browser half of OwlMeans chat bots — shadcn + Tailwind v4 panels a screen renders over one bound
bot surface (`appProtocols.api.bot.operator` or `.member`), their hooks and their translations. The
contracts they are written against live in `@owlmeans/bot`.

## Overview

- `BotConnectionsPanel({ surface, platforms?, allowMock? })` — connect, verify, switch off and remove the bot accounts
- `BotRulesPanel({ surface, actions, connection? })` — the keyword groups and their editor, limited to the kit's actions
- `BotActivityPanel({ surface, connection? })` — what the bot did, newest first, refreshed while visible
- `BotSimulator({ surface, connection })` — feed a message to a MOCK connection and watch the reaction
- `useBotConnections(surface)`, `useBotRules(surface, { connection? })`, `useBotActivity(surface, { connection?, limit?, refreshMs? })` — the I/O half
- `botErrorHelper`, `botViewHelper` — the error-copy keys and the row helpers, for a host that draws its own view
- `cn` — the class-name merger the components are written against

## Installation

```bash
bun add @owlmeans/web-bot@^0.1.18-rc.2
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
import { BotPlatform, BotRuleAction } from '@owlmeans/bot'
import { BotActivityPanel, BotConnectionsPanel, BotRulesPanel } from '@owlmeans/web-bot'

const surface = appProtocols.api.bot.operator

<BotConnectionsPanel surface={surface} platforms={[BotPlatform.Telegram]} allowMock={!production} />
<BotRulesPanel surface={surface} actions={[BotRuleAction.Delete, BotRuleAction.Warn]} />
<BotActivityPanel surface={surface} />
```

## Translations

Strings are registered at the library tier as `lib : bot.*` in English, Polish, Russian,
Belarusian, Ukrainian, Spanish, German and French — importing the package registers them. An
application overrides any of them at the app tier, in the library namespace:

```ts
import { i18nHelper, LIB_NAMESPACE } from '@owlmeans/i18n'

i18nHelper.addI18nApp('en', 'bot', { connections: { title: 'Your bots' } }, { ns: LIB_NAMESPACE })
```

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.59
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
