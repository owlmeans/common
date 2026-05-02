# @owlmeans/client-module

Client-side module system: elevates route definitions into API-calling `ClientModule` instances.

## Overview

- `elevate(modules, alias, handler?, opts?)` — attaches a client handler to a module (mirrors server `elevate`)
- `ClientModule<T>` has a `call(request?)` method that resolves the URL and makes an HTTP/WS request
- `stab` — no-op handler for modules that only need URL resolution (no logic)
- `provideRequest(alias, path)` — creates an `AbstractRequest` for programmatic module calls
- `pickPerSchema(schema, obj)` — extracts fields from an object matching an AJV schema
- Re-exported as `celevate` from `@owlmeans/server-app`

## Installation

```bash
bun add @owlmeans/client-module
```

## Usage

Define and elevate a client module for API calls:

```typescript
import { elevate, stab } from '@owlmeans/client-module'
import type { ClientModule } from '@owlmeans/client-module'

const appModules = [
  module(route('project-list', '/projects', frontend('base'))),
  module(route('project-create', '/projects', backend(RouteMethod.POST))),
]

// Frontend navigation — just a stub, no network call
elevate(appModules, 'project-list', stab)

// Backend API call — call() makes a POST request
elevate(appModules, 'project-create')
```

Call a module from a service:

```typescript
const agentModule = ctx.module<ClientModule<Project>>(agent.project.create)
const [result] = await agentModule.call({
  body: { prompt: payload.prompt, entity: req.auth?.entityId }
})
```

## API

### `elevate<T, R>(modules, alias, handler?, opts?): ClientModule<T, R>[]`

Mutates `modules` in-place and returns the array typed as `ClientModule`. The `handler` sets how `call()` behaves.

### `stab: RefedModuleHandler`

No-op handler for frontend-only modules that just need URL resolution.

### `ClientModule<T>` (type)

- `call(request?)` — resolves URL, makes HTTP request, returns `[T, ModuleOutcome]`
- `validate(request?)` — validates the request against the module filter schema
- `getPath(partial?)` — returns the URL path (with or without path params)

### `provideRequest<T>(alias, path): AbstractRequest<T>`

Creates a minimal request object for programmatic `call()` invocations.

### `pickPerSchema<T>(schema, obj): Partial<T>`

Extracts only the keys present in the AJV schema from `obj`.

## Related Packages

- [`@owlmeans/module`](../module) — `CommonModule` base that gets elevated
- [`@owlmeans/client`](../client) — `useNavigate` uses `ClientModule.call()`
- [`@owlmeans/server-app`](../server-app) — re-exports `elevate` as `celevate`
