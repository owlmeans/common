# @owlmeans/web-auth-token

The browser half of long-lived access tokens (API keys) — the management panel, its headless hook
and its translations. The contracts it is written against live in `@owlmeans/auth-token`.

## Overview

- `ConnectedAccessTokensPanel` — the whole feature: the panel wired to the token entrypoints
- `AccessTokensPanel` — the same panel, presentational: no I/O, renders what it is given
- `useAccessTokens(aliases?)` — the I/O half: list, create, revoke, and the issued token
- `tokenStatus` / `formatMoment` — the row helpers, exported for a host that builds its own view
- `cn` — the class-name merger the components are written against

## Installation

```bash
bun add @owlmeans/web-auth-token@^0.1.18-rc.1
```

The package ships its own private shadcn primitives and imports them with relative specifiers.
Consumers do not vendor its `alert`, `badge`, `button`, `card`, `dialog`, `input`, `label`,
`select` or `table` files; they provide the documented React, Radix and Tailwind peer dependencies.

## The `@source` line — required

Tailwind's scanner excludes `node_modules`, so classes that exist only inside this package never
reach the application's stylesheet and the panel renders unstyled. Add the package's shipped `src`
directory to the app's Tailwind entry:

```css
@import "tailwindcss";

@source "../../../node_modules/@owlmeans/web-auth-token/src";
```

The relative depth follows the app's own layout.

## Usage

Mount the routes the contracts declare, then render the panel:

```tsx
import { makeAuthTokenEntrypoints } from '@owlmeans/auth-token'
import { ConnectedAccessTokensPanel } from '@owlmeans/web-auth-token'

context.registerEntrypoints(makeAuthTokenEntrypoints({ parent: account.base }))

export const TokensScreen: FC = () => <ConnectedAccessTokensPanel
  usageHint="curl -H 'Authorization: Bearer <token>' https://api.example.com/v1/me"
/>
```

Pass `aliases` when the routes are mounted under an application's own names, and render
`AccessTokensPanel` directly when the application owns the transport.

## Translations

Strings are registered at the library tier as `lib : auth-token.panel.*` in all seven supported
languages. An application overrides any of them by registering the same resource at the app tier —
the namespace has to be said out loud, because `addI18nApp` defaults it to the resource name:

```ts
import { addI18nApp, LIB_NAMESPACE } from '@owlmeans/i18n'

addI18nApp('en', 'auth-token', { panel: { title: 'API keys' } }, { ns: LIB_NAMESPACE })
```

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.17
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
