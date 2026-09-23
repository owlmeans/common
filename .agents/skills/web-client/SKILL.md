---
name: web-client
description: Bind OwlMeans shared entrypoint protocols in a browser application. Use when registering client routes, attaching React screens (including lazily-loaded ones), calling API protocols, or configuring the browser context.
---

# Browser protocol entrypoints

**Install:** `bun add @owlmeans/web-client@^0.1.18-rc.50`

Shared protocol declarations are immutable. Bind a complete protocol tree for callable API routes,
then bind frontend declarations to screens.

```ts
import { bindAll, bindScreen, entrypoints as frameworkEntrypoints, handler } from '@owlmeans/web-panel'
import { projectProtocols, webProtocols } from 'project-common'
import { ProjectScreen } from './screens/project.js'

export const clientBindings = [
  ...frameworkEntrypoints,
  ...bindAll(projectProtocols),
  bindScreen(webProtocols.project, handler(ProjectScreen)),
]
```

Call a protocol directly. Its request and response types come from its shared contract.

```ts
const project = await context.entrypoint(projectProtocols.get).call({
  params: { id: projectId },
})
```

## Lazily-loaded screens

`lazyHandler` and `lazyComponent` (from `@owlmeans/client`) are re-exported here and by
`@owlmeans/web-panel`, next to `handler`. A `lazyHandler(...)` result binds exactly like
`handler(Component)`; declare it at module scope, where the bindings live — never inside a render.

```tsx
import { bindScreen, lazyHandler } from '@owlmeans/web-client'

const reportsScreen = lazyHandler(() => import('./screens/reports.js'), 'ReportsScreen', {
  fallback: <Spinner />,
})

export const clientBindings = [
  bindScreen(webProtocols.reports, reportsScreen),
]
// reportsScreen.preload() on hover/focus of a link renders the screen without its fallback.
```

The fallback renders inside the screen's own `Suspense` boundary, so the layout around it stays
mounted while the chunk loads. Rules and options: the `client` skill, Code-splitting.

## Rendering after an async boot

If your app awaits something (e.g. `prepareI18n`) before calling `render()`, this is handled
correctly — the render helper checks `document.readyState` rather than unconditionally waiting for
an event that may already have fired. It waits for `DOMContentLoaded` only while the document is
still `loading` and mounts at once otherwise; `renderApp` and `@owlmeans/web-panel`'s `render` both
go through it.

```ts
import { prepareI18n } from '@owlmeans/client-i18n'

await prepareI18n(context.cfg)
renderApp(context)            // or @owlmeans/web-panel's render(context)
```

## Rules

- Declare paths, guards, gates and contracts once in the shared protocol tree.
- Bind every API declaration the browser calls, including route parents.
- Use `bindScreen(protocol, handler(Component))` — or `lazyHandler(...)` — only for frontend route
  declarations.
- Do not replace request/response typing at a call site; update the shared contract instead.
- Keep framework entrypoints and application entrypoints in one registered array, without mutating a
  shared declaration collection.
