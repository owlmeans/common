# @owlmeans/client-entrypoint

Client-side entrypoint system: elevates route definitions into API-calling `ClientEntrypoint` instances.

## Overview

- `elevate(entrypoints, alias, handler?, opts?)` — attaches a client handler to an entrypoint (mirrors server `elevate`)
- `ClientEntrypoint<T>` exposes three explicit verbs: `call()` for the value, `invoke()` for the value
  plus its outcome, and `url()` for the address
- `stab` — no-op handler for entrypoints that only need a URL (no logic)
- `provideRequest(alias, path)` — creates an `AbstractRequest` for programmatic entrypoint calls
- `pickPerSchema(schema, obj)` — extracts fields from an object matching an AJV schema
- Re-exported as `celevate` from `@owlmeans/server-app`

## Installation

```bash
bun add @owlmeans/client-entrypoint@^0.1.18-rc.12
```

## Usage

Define and elevate a client entrypoint for API calls:

```typescript
import { elevate, stab } from '@owlmeans/client-entrypoint'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'

const appEntrypoints = [
  entrypoint(route('project-list', '/projects', frontend('base'))),
  entrypoint(route('project-create', '/projects', backend(RouteMethod.POST))),
]

// Frontend navigation — a screen, addressed with url(); call()/invoke() throw on it
elevate(appEntrypoints, 'project-list', stab)

// Backend API call — call() makes a POST request
elevate(appEntrypoints, 'project-create')
```

Call an entrypoint from a service:

```typescript
const agentEntrypoint = ctx.entrypoint<ClientEntrypoint<Project>>(agent.project.create)
const result = await agentEntrypoint.call({
  body: { prompt: payload.prompt, entity: req.auth?.entitySlug }
})
```

Take the outcome when it decides what happens next, and build a link with `url()`:

```typescript
const { value, outcome } = await agentEntrypoint.invoke({ body: payload })

const href = await ctx.entrypoint<ClientEntrypoint>('project-list')
  .url({ params: { id: value.id } }, { absolute: true })
```

## API

### `elevate<T, R>(entrypoints, alias, handler?, opts?): ClientEntrypoint<T, R>[]`

Replaces the element carrying `alias` with its elevated counterpart, in place, and returns the array typed as `ClientEntrypoint`. The `handler` sets how `call()` behaves. Elevating the same alias again just replaces it again; guards passed here are added to the ones the entrypoint declared. Throws when no entrypoint carries the alias.

### `stab: RefedEntrypointHandler`

No-op handler for frontend-only entrypoints that are addressed by URL rather than called.

### `ClientEntrypoint<T>` (type)

- `call(request?)` — addresses the entrypoint over the wire and resolves to the value, throwing
  whatever error the reply carried
- `invoke(request?)` — the same round trip, resolving to `{ value, outcome }`
- `url(request?, { absolute? })` — builds the URL this entrypoint addresses, with `:params` filled in
  and the query appended; absolute when the route belongs to another service or `absolute` is asked for
- `validate(request?)` — validates the request against the entrypoint filter schema
- `segment()` / `path()` / `mount()` — the segment this entrypoint contributes, that segment under its
  ancestors, and the same path under the service base. All three are computed from the declaration
  and the context on every call — nothing is written back into the route.

An entrypoint carrying a renderer *is* a screen: it is addressed by URL, never called over the wire,
so `call()` and `invoke()` throw and point the caller at `url()`.

### `provideRequest<T>(alias, path): AbstractRequest<T>`

Creates a minimal request object for programmatic `call()` invocations.

### `pickPerSchema<T>(schema, obj): Partial<T>`

Extracts only the keys present in the AJV schema from `obj`.

### `@owlmeans/client-entrypoint/utils`

The low-level pair the verbs are built on, for code that holds an entrypoint reference directly:

- `entrypointUrl(ref, request, opts?)` — the address behind `url()`
- `apiInvoke(ref, opts?)` — the round trip behind `invoke()`

## Related Packages

- [`@owlmeans/entrypoint`](../entrypoint) — `CommonEntrypoint` base that gets elevated
- [`@owlmeans/client`](../client) — `useNavigate` navigates by `ClientEntrypoint.url()`
- [`@owlmeans/server-app`](../server-app) — re-exports `elevate` as `celevate`

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
