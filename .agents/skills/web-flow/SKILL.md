---
name: web-flow
description: How to use @owlmeans/web-flow — the browser flow service (makeFlowService, appendFlowService) that rehydrates a flow from the URL and redirects between steps, plus useFlow() for the screen currently rendering. Auto-invoked when importing web flow primitives, wiring a flow into a browser app, or carrying flow state across a redirect.
user-invocable: false
---

# @owlmeans/web-flow

**Layer:** Web (React)
**Install:** `"@owlmeans/web-flow": "^0.1.18-rc.16"` in `dependencies`

The browser half of the flow stack: it supplies the `proceed` that `@owlmeans/client-flow` refuses,
and it reads and writes the query parameter that carries the state.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeFlowService(alias?)` | The web flow service — the basic one plus browser `proceed` and `goHome`, and a `lazyInit` that rehydrates from the URL |
| `appendFlowService(ctx, alias?)` | Register it together with the `FLOW_STATE` client resource the state persists in |
| `useFlow(target?)` | The `FlowClient` for the screen currently rendering; `null` until it resolves |
| `FlowService` | The `client-flow` service plus `goHome(alias?, dryRun?)` |
| `QUERY_PARAM` (`flow`) · `SERVICE_PARAM` (`service`) | The default state parameter, and the parameter naming the target service |

The alias both factories default to is `DEFAULT_ALIAS` (`flow`) from `@owlmeans/client-flow` — this
package does not re-export it. **Keep that alias.** `useFlow` resolves the service as
`context.service(DEFAULT_ALIAS)` and `createFlowClient` does the same, both hardcoded, so a service
registered under any other name is never found and the first `useFlow` throws
`SyntaxError('Service <alias> not found')`. The `alias` argument builds a second instance for a
caller that addresses it by hand; nothing on the hook path can reach one.

## Wiring

```typescript
import { appendFlowService } from '@owlmeans/web-flow'
appendFlowService(context)
```

## Reading the flow from the URL

`lazyInit` runs after the basic service has loaded its definitions: it reads
`FlowConfig.queryParam` (defaulting to `QUERY_PARAM`) off `window.location`, restores the model from
it, and resolves `supplied` — `true` when there was a state, `false` when there was not, and
rejected with a `ResilientError` when the token was there but unreadable. A screen that awaits
`state()` therefore learns which of the three happened instead of hanging.

```typescript
import { useFlow } from '@owlmeans/web-flow'

const flow = useFlow()
if (flow == null) return <Spinner />        // still resolving
await flow.proceed(flow.flow().next())
```

`useFlow` prefers an explicit state: when the rendering entrypoint has a `flow` **path parameter**
it loads that token directly. Otherwise it boots a client against the target named by the `service`
query parameter, falling back to the argument. It re-resolves when any of those inputs change.

## Two different `proceed`s

The `flow.proceed(...)` above is **not** this package's. They are separate methods with separate
signatures, and only one of them takes `dryRun`:

| Call | Whose | What it does |
|---|---|---|
| `FlowClient.proceed(transition, req?)` | `@owlmeans/client-flow`, what `useFlow()` hands back | Checks the destination step, transits the model, resolves that step's URL. A **relative** URL is an in-app `nav.navigate` and the document stays; only an `http…` URL is passed down to the service below. It has no `dryRun` — a second argument that is not a request is ignored. |
| `FlowService.proceed(req?, dryRun?)` | this package, reached through `context.service(...)` | The browser redirect, for the step the model is standing on |

`FlowService.proceed` addresses the **current** step's entrypoint with
`url(request, { absolute: true })`, sets the serialized flow on the result's query string, and
assigns `document.location.href` — so the receiving app rehydrates from the URL. It returns that
URL either way, and `dryRun` gets it without leaving the page. A service holding no live model
raises `UnknownTransition('service.proceed')`, and a current step with no `module` raises
`FlowStepMissconfigured`.

So a step inside the same app is reached without leaving the document; only a step in another
service becomes a page load.

## Ending a flow

`goHome(alias?, dryRun?)` ends a flow by leaving for a service's own home: the alias given, else the
service route marked default, else this app's. The address is the route's `home`, then
`cfg.brand.home` — and a hard-coded public address as the last resort, so a service route without a
`home` sends the user off the application rather than nowhere.

## Depends On

- `@owlmeans/client-flow` (the service and runner this extends), `@owlmeans/flow`
- `@owlmeans/client`, `@owlmeans/client-context`, `@owlmeans/client-entrypoint`,
  `@owlmeans/client-resource`, `@owlmeans/context`, `@owlmeans/error`
- `react` (peer)

## Related

- [[flow]] — the definition and serialization contract
- [[client-flow]] — the service and the `FlowClient` this builds on
