---
name: client-flow
description: How to use @owlmeans/client-flow — the platform-agnostic flow service (makeBasicFlowService) that loads @owlmeans/flow definitions from config records, and createFlowClient(context, nav), the runner a screen drives to advance a flow and navigate to each step. Auto-invoked when importing client flow primitives, registering a flow service, or moving a screen to the next flow step.
user-invocable: false
---

# @owlmeans/client-flow

**Layer:** Client
**Install:** `"@owlmeans/client-flow": "^0.1.18-rc.16"` in `dependencies`

Two objects, with different lifetimes. The **service** lives on the context and owns the flow
definitions and the one live `FlowModel`. The **client** is built per screen, wraps that model with
a `Navigator`, and is what a component actually calls.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeBasicFlowService(alias?)` | The service factory — the platform-agnostic half. `alias` defaults to `DEFAULT_ALIAS`, which is the only value the runner can find |
| `FlowService` | `ready()` `state()` `begin(slug?, from?)` `load(token)` `provideFlow` `config()` `proceed(req?, dryRun?)` `resolvePair()` `supplied` `flow` |
| `createFlowClient(context, nav)` | The runner a screen drives. `nav` is the `Navigator` from `useNavigate()` in `@owlmeans/client` |
| `FlowClient` | `boot(target: string \| null, from?)` `setup(model)` `flow()` `service()` `proceed(transition, req?)` `persist()` |
| `StateRecord` / `StateResource` | The `FlowState` stored as a record, and the client resource holding it |
| `ResolvePair` | The `{ resolve, reject }` behind `service.supplied` |
| `DEFAULT_ALIAS` (`flow`) | The service alias |
| `FLOW_STATE` (`state:flow`) | Alias of the client resource the state is persisted in, and the record id inside it |
| `EXTRA_FLOW` (`extra-flow`) · `REHACK_MOD` (`__redirect`) | Id of the second, side-band state record kept in the same resource, and the alias of the entrypoint synthesized to address a target service |

## Wiring

```typescript
import { makeBasicFlowService } from '@owlmeans/client-flow'
context.registerService(makeBasicFlowService())
```

**Register it under `DEFAULT_ALIAS`, which is what the no-argument call does.** `createFlowClient`
resolves its service with a hardcoded `context.service(DEFAULT_ALIAS)`, and `useFlow` in
`@owlmeans/web-flow` looks the same alias up, so a service registered under any other name is never
reached and the lookup throws `SyntaxError('Service <alias> not found')`. The `alias` argument
builds a second instance for a caller that addresses it itself — nothing on the runner path can.

A browser app registers the web service instead — `appendFlowService` from `@owlmeans/web-flow`,
which builds on this one and also creates the `FLOW_STATE` resource.

## What the service does

Initialization reads every `FLOW_RECORD` config record through the config resource and turns each
into a `Flow`: `$`-prefixed `service`, `module` and `path` values are resolved against
`FlowConfig.services` / `modules` / `pathes`, and one serialized entry state is precomputed per
initial step. `provideFlow` then answers by name out of that table and throws `UnknownFlow` for a
name it does not hold — which is exactly what `makeFlowModel` needs in order to fall back to
reading the string as a serialized token.

`begin(slug?, from?)` starts a flow — `slug` defaults to `FlowConfig.defaultFlow`, then to
`STD_AUTH_FLOW`, and `from` names which **initial** step to enter — while `load(token)` restores one.
Both set `service.flow` and replace `supplied` with an already-resolved promise. `state()` awaits
`supplied` before answering, so a screen can ask for the state before the URL has been read; the
platform half is what resolves the original `supplied` (through `resolvePair()`) when there was
nothing to restore.

`proceed` on the basic service throws `FlowUnsupported('service.proceed')`. Leaving the flow for
another service is platform work, and `@owlmeans/web-flow` is what supplies it.

## What the client does

`createFlowClient` needs a `Navigator` — the one `useNavigate()` from `@owlmeans/client` returns.
In a browser `useFlow()` from `@owlmeans/web-flow` builds the whole thing for the rendering screen;
build it by hand only outside that.

```typescript
import { useContext, useNavigate } from '@owlmeans/client'
import { createFlowClient } from '@owlmeans/client-flow'

const context = useContext()
const nav = useNavigate()

const client = await createFlowClient(context, nav).boot(targetServiceAlias)  // `null` for none
// ...or createFlowClient(context, nav).setup(model) when a model is already loaded

await client.proceed(client.flow().next())     // advance and go to the next step
await client.persist()                         // survive a reload
```

`boot(target, from?)` takes `string | null`, and `null` is a meaningful argument — it says "no
target named", which is what the browser hook passes when no `service` query parameter is present.

It waits for the service and asks for the state it already holds. **A live model is adopted as it
is and nothing else runs** — no target is recorded on that path, and `FlowTargetError` cannot be
raised from it. Everything below happens only when the service holds no model:

1. When `FLOW_STATE` is registered and holds a record, its flow is begun and the record set as the
   model's state; a `null` `target` argument then falls back to `record.service`.
2. With no such record, a fresh flow is begun (`begin(undefined, from)`).
3. If a target alias resolved by then, `cfg.shortAlias` is translated to `cfg.service`, the alias is
   looked up with `context.serviceRoute`, and a lookup that throws is re-raised as
   `FlowTargetError`. The resolved service is recorded on the model with `target()`.

With no alias and no restored record, step 3 is skipped and the state's `service` stays the empty
string it starts as — `client.service()` then asks `context.serviceRoute('')`, which throws. That
is the shape of "this flow was booted without a target".

`proceed(transition, req?)` looks the transition's **destination** step up first and raises
`FlowStepMissconfigured(<that step>)` when it carries no `module` — the check is on the step being
entered, not the one being left. It then transits the model, merging the previous payload with
`req.params` and `req.query`, and addresses the destination's entrypoint. When that step's `service`
is `TARGET_SERVICE`, an entrypoint is synthesized under `REHACK_MOD` pointing at the dispatcher path
of the state's own target service, so "go back to whoever started this" needs no declaration.

A **relative** URL is an in-app `nav.navigate`: the document stays and nothing serializes the flow
onto the URL — the live model on the service is what carries it, which is why `persist()` exists.
Only a URL starting with `http` is handed on to `service.proceed`, the browser redirect that puts
the serialized flow in the query string. There is no `dryRun` on this method; that argument belongs
to the service's own `proceed`.

`persist()` saves the state under `FLOW_STATE` and answers `false` when no such resource is
registered, so persistence is opt-in rather than a hard requirement.

## Depends On

- `@owlmeans/flow` — the definitions, the model and the error family
- `@owlmeans/client`, `@owlmeans/client-context`, `@owlmeans/client-entrypoint`,
  `@owlmeans/client-resource`
- `@owlmeans/config` (the config resource the definitions are read from), `@owlmeans/auth-common`
  (the dispatcher path), `@owlmeans/context`, `@owlmeans/entrypoint`, `@owlmeans/error`,
  `@owlmeans/resource`, `@owlmeans/route`
- `react` (peer)

## Related

- [[flow]] — the definition, state and serialization contract
- [[web-flow]] — the browser service that supplies `proceed` and `goHome`
