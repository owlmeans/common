# @owlmeans/mui-panel

MUI + React Router base for OwlMeans web apps — `makeContext`, panel/form components, and hand-picked re-exports for app-side entrypoints.

## Overview

- `makeContext(cfg)` / `useContext()` — base web context with API config middleware and flow service wired in
- `render(context, theme?, opts?)` — entry-point renderer that wraps the app with MUI theme and i18n
- `entrypoints` — base entrypoint declarations for auth panel screens
- Components and form primitives in `./components`
- Re-exports from sibling packages: `entrypoint`, `route`, `frontend`, `handler`, `elevate`, `useNavigate`, `useI18nApp`, `HOME`, `BASE`, `ROOT`, `GUEST`, `flow`, `configureFlows`, `CAUTHEN_FLOW_ENTER`, `Dispatcher`, `appendWebAuthService`, `addWebService`, etc.
- Inherits all `@owlmeans/client-panel` exports (`ClientForm`, `InputCtrl`, `ActionCtrl`, …)

## Installation

```bash
bun add @owlmeans/mui-panel@^0.1.18-rc.26
```

## Usage

Build the app context on top of `web-panel`:

```typescript
import {
  useContext as useBasicContext,
  makeContext as makeBasicContext
} from '@owlmeans/mui-panel'
import { appendOidcGuard } from '@owlmeans/mui-oidc-rp'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg) as T
  appendOidcGuard<C, T>(context)
  return context
}

export const useContext = useBasicContext
```

The factory calls the factory of the layer below it, applies its own idempotent `append*` mixins, and
returns that same context. One context is built per process and nothing is stored for re-creation.

Compose your entrypoints over the base set:

```typescript
import { entrypoints as baseEntrypoints } from '@owlmeans/mui-panel'

export const entrypoints = [...baseEntrypoints, ...appEntrypoints]
```

Use the re-exported helpers in screens:

```typescript
import { HOME, useI18nApp, useNavigate } from '@owlmeans/mui-panel'

const t = useI18nApp('manager-web')
const navigate = useNavigate()
```

Render the app:

```typescript
import { render } from '@owlmeans/mui-panel'
import { theme } from './theme'

render(context, theme)
```

## API

### `makeContext<C, T>(cfg): T`

Creates a web context: registers `apiConfigMiddleware`, the flow service, and adds `context.flow()` accessor.

### `useContext<C, T>(): T`

React hook returning the current context.

### `render<C, T>(context, theme?, opts?)`

Mounts the React tree using the configured theme and i18n detector.

### `entrypoints`

Base entrypoint declarations for auth panel screens.

### Re-exports

Cherry-picked APIs from `@owlmeans/client`, `@owlmeans/client-context`, `@owlmeans/client-entrypoint`, `@owlmeans/client-route`, `@owlmeans/client-config`, `@owlmeans/client-auth`, `@owlmeans/client-i18n`, `@owlmeans/web-client`, `@owlmeans/web-flow`, `@owlmeans/route`, `@owlmeans/entrypoint`, `@owlmeans/auth`, `@owlmeans/i18n`, `@owlmeans/flow`, `@owlmeans/config`, `@owlmeans/context`. See `src/exports.ts` for the full list.

Plus full re-export of [`@owlmeans/client-panel`](../client-panel).

## Related Packages

- [`@owlmeans/web-client`](../web-client) — provides `render` and the underlying web context
- [`@owlmeans/client-panel`](../client-panel) — cross-platform form/panel primitives re-exported here
- [`@owlmeans/web-flow`](../web-flow) — flow service registered by `makeContext`
- [`@owlmeans/mui-oidc-rp`](../mui-oidc-rp) — typically chained on top of this `makeContext`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
