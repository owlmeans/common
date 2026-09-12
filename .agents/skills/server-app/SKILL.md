---
name: server-app
description: Build OwlMeans server applications from immutable entrypoint protocol declarations. Use when starting a server, binding endpoint implementations, configuring services, or registering server entrypoints.
---

# Server application entrypoints

Declare routes and request/response contracts in a shared package with `protocol()` or
`openProtocol()`. A server package supplies local implementations with `bind()` and `handlers()`;
it never changes a shared declaration by alias.

```ts
import { bind, entrypoints, handlers } from '@owlmeans/server-app'
import { projectEntrypoints } from 'project-common'
import { createProject } from './app/project.js'

const api = handlers<Context>()

export const appEntrypoints = [
  ...entrypoints,
  bind(projectEntrypoints.base),
  bind(projectEntrypoints.create, api.body(projectEntrypoints.create, createProject)),
]
```

`handlers<Context>().body`, `.params` and `.request` infer request sections and response values
from the declaration. Use `.request` for a transport-level handler that needs the complete request
boundary.

## Rules

- Keep `protocol()` declarations in the common package shared by callers and servers.
- Bind parent/group declarations as well as leaves; parents establish inherited paths and access.
- Use direct protocol references in `context.entrypoint(protocol)`; do not supply a caller-side
  response generic.
- Model validation belongs in `contract()` with `typed()` or `schema()`, not in a wrapper around a
  handler.
- `entrypoints` contains framework registrations. Add local entrypoints to a new array and register
  that array during context initialization.

`holdApiPort`, `config`, `sservice`, `service`, `AppType` and the context bootstrap exports remain
available from this package for process wiring.
