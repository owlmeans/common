---
name: web-client
description: Bind OwlMeans shared entrypoint protocols in a browser application. Use when registering client routes, attaching React screens, calling API protocols, or configuring the browser context.
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Browser protocol entrypoints

Shared protocol declarations are immutable. Bind a complete protocol tree for callable API routes,
then bind frontend declarations to screens.

```ts
import { bindAll, bindScreen, entrypoints as frameworkEntrypoints, handler } from '@owlmeans/web-panel'
import { projectEntrypoints, webEntrypoints } from 'project-common'
import { ProjectScreen } from './screens/project.js'

export const appEntrypoints = [
  ...frameworkEntrypoints,
  ...bindAll(projectEntrypoints),
  bindScreen(webEntrypoints.project, handler(ProjectScreen)),
]
```

Call a protocol directly. Its request and response types come from its shared contract.

```ts
const project = await context.entrypoint(projectEntrypoints.get).call({
  params: { id: projectId },
})
```

## Rules

- Declare paths, guards, gates and contracts once in the shared protocol tree.
- Bind every API declaration the browser calls, including route parents.
- Use `bindScreen(protocol, handler(Component))` only for frontend route declarations.
- Do not replace request/response typing at a call site; update the shared contract instead.
- Keep framework entrypoints and application entrypoints in one registered array, without mutating a
  shared declaration collection.
