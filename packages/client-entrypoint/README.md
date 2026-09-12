# @owlmeans/client-entrypoint

Client-side entrypoint system: binds shared protocol declarations into API-calling client views.

## Overview

- `bind(protocol, opts?)` — binds one shared protocol declaration
- `bindAll(protocolTree)` — binds every protocol in a shared declaration tree
- `bindScreen(protocol, handler, opts?)` — binds a screen renderer to a shared frontend protocol
- `ClientProtocolEntrypoint<Protocol>` exposes three explicit verbs: `call()` for the value,
  `invoke()` for the value plus its outcome, and `url()` for the address
- `stab` — no-op handler for entrypoints that only need a URL (no logic)
- `provideRequest(alias, path)` — creates an `AbstractRequest` for programmatic entrypoint calls
- `pickPerSchema(schema, obj)` — extracts fields from an object matching an AJV schema

## Installation

```bash
bun add @owlmeans/client-entrypoint@^0.1.18-rc.12
```

## Usage

Bind shared protocols for browser API calls and screens:

```typescript
import { bindAll, bindScreen, stab } from '@owlmeans/client-entrypoint'
import { appEntrypoints as protocols } from 'my-app-common'
import { handler } from '@owlmeans/client'
import { ProjectListScreen } from './screens/project-list.js'

const appEntrypoints = [
  ...bindAll(protocols.api),
  bindScreen(protocols.web.projectList, handler(ProjectListScreen)),
  bindScreen(protocols.web.project, stab),
]
```

Call an entrypoint from a service:

```typescript
const agentEntrypoint = ctx.entrypoint(agent.project.create)
const result = await agentEntrypoint.call({
  body: { prompt: payload.prompt, entity: req.auth?.entitySlug }
})
```

Take the outcome when it decides what happens next, and build a link with `url()`:

```typescript
const { value, outcome } = await agentEntrypoint.invoke({ body: payload })

const href = await ctx.entrypoint(protocols.web.projectList)
  .url({ params: { id: value.id } }, { absolute: true })
```

## API

### `bind<Protocol>(protocol, opts?): ClientProtocolEntrypoint<Protocol>`

Materializes one immutable protocol declaration for a browser context. The declaration is never mutated.

### `bindAll(protocolTree): ClientProtocolEntrypoint[]`

Materializes every protocol in a shared declaration tree, preserving each protocol reference for typed context lookup.

### `bindScreen<Protocol>(protocol, handler, opts?): ClientProtocolEntrypoint<Protocol>`

Materializes a frontend protocol and attaches its renderer.

### `stab: RefedEntrypointHandler`

No-op handler for frontend-only entrypoints that are addressed by URL rather than called.

### `ClientProtocolEntrypoint<Protocol>` (type)

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

- [`@owlmeans/entrypoint`](../entrypoint) — `CommonEntrypoint` base that gets materialized
- [`@owlmeans/client`](../client) — `useNavigate` navigates by a bound protocol's `url()`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.18
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
