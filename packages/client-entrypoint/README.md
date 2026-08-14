# @owlmeans/client-entrypoint

Client-side entrypoint system: elevates route definitions into API-calling `ClientEntrypoint` instances.

## Overview

- `elevate(entrypoints, alias, handler?, opts?)` — attaches a client handler to an entrypoint (mirrors server `elevate`)
- `ClientEntrypoint<T>` has a `call(request?)` method that resolves the URL and makes an HTTP/WS request
- `stab` — no-op handler for entrypoints that only need URL resolution (no logic)
- `provideRequest(alias, path)` — creates an `AbstractRequest` for programmatic entrypoint calls
- `pickPerSchema(schema, obj)` — extracts fields from an object matching an AJV schema
- Re-exported as `celevate` from `@owlmeans/server-app`

## Installation

```bash
bun add @owlmeans/client-entrypoint
```

## Usage

Define and elevate a client entrypoint for API calls:

```typescript
import { elevate, stab } from '@owlmeans/client-entrypoint'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'

const appModules = [
  entrypoint(route('project-list', '/projects', frontend('base'))),
  entrypoint(route('project-create', '/projects', backend(RouteMethod.POST))),
]

// Frontend navigation — just a stub, no network call
elevate(appModules, 'project-list', stab)

// Backend API call — call() makes a POST request
elevate(appModules, 'project-create')
```

Call an entrypoint from a service:

```typescript
const agentEntrypoint = ctx.entrypoint<ClientEntrypoint<Project>>(agent.project.create)
const [result] = await agentEntrypoint.call({
  body: { prompt: payload.prompt, entity: req.auth?.entityId }
})
```

## API

### `elevate<T, R>(entrypoints, alias, handler?, opts?): ClientEntrypoint<T, R>[]`

Mutates `entrypoints` in-place and returns the array typed as `ClientEntrypoint`. The `handler` sets how `call()` behaves.

### `stab: RefedEntrypointHandler`

No-op handler for frontend-only entrypoints that just need URL resolution.

### `ClientEntrypoint<T>` (type)

- `call(request?)` — resolves URL, makes HTTP request, returns `[T, EntrypointOutcome]`
- `validate(request?)` — validates the request against the entrypoint filter schema
- `getPath(partial?)` — returns the URL path (with or without path params)

### `provideRequest<T>(alias, path): AbstractRequest<T>`

Creates a minimal request object for programmatic `call()` invocations.

### `pickPerSchema<T>(schema, obj): Partial<T>`

Extracts only the keys present in the AJV schema from `obj`.

## Related Packages

- [`@owlmeans/entrypoint`](../entrypoint) — `CommonEntrypoint` base that gets elevated
- [`@owlmeans/client`](../client) — `useNavigate` uses `ClientEntrypoint.call()`
- [`@owlmeans/server-app`](../server-app) — re-exports `elevate` as `celevate`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
