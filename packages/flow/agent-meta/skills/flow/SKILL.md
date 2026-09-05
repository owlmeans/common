---
name: flow
description: How to use @owlmeans/flow — a serializable step/transition state machine whose whole state collapses to one string. Auto-invoked when importing from this package, driving a multi-step workflow, or restoring one from a token.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/flow

**Layer:** Cross-cutting domain
**Install:** `"@owlmeans/flow": "^0.1.18-rc.14"` in `dependencies`

A flow is a set of named **steps**, each offering named **transitions** to other steps. What makes
it worth using over a hand-rolled switch is that the whole live state — `flow`, `step`, `previous`,
`service`, `entityId`, `payload`, `message`, `ok` — serializes to a single compact string and
restores from it. That is what lets a workflow survive a redirect, a page load, or a process.

## Key exports

| Export | Description |
|---|---|
| `makeFlowModel(flow, provider?)` | Build a driver. `flow` is a `ShallowFlow` **object** (no provider needed) or a **string** — tried as a flow name first, then as a serialized token. |
| `FlowModel` | `target` `entity` `enter` `steps` `state` `setState` `payload` `updatePayload` `step` `transitions` `transition` `next` `transit` `serialize` |
| `ShallowFlow` / `FlowStep` / `FlowTransition` / `FlowState` / `FlowPayload` / `SerializedFlow` | The definition, the live state, and the compact shape the token encodes |
| `Flow` | A `ShallowFlow` a provider resolved: it also carries the resolved `config` and the `prefabs` — one serialized entry state per initial step |
| `FlowProvider` | `(flow: string) => Promise<Flow>` — resolves a flow by name |
| `FlowConfig` / `WithFlowConfig` / `FlowConfigRecord` | `{ queryParam, services, modules, pathes, defaultFlow }`, the `flowConfig` field it sits on, and the config-record form of a definition |
| `flow(cfg, flow)` · `configureFlows(cfg, config)` | Register a definition as a `FLOW_RECORD` config record / set `FlowConfig` |
| `stdStabFlow`, `stdOidcFlow`, `stdOidpFlow`, `stdAuthFlow` (deprecated) | Built-in flows, with `StdAuthStep` / `OidcAuthStep` / `OidpAuthStep` naming their steps |
| `STD_STAB_FLOW` `STD_OIDC_FLOW` `STD_OIDP_FLOW` `STD_AUTH_FLOW` | Their names — deliberately short, because every one of them is spent inside a URL |
| `FLOW_RECORD` (`flow`) · `CFG_FLOW_PREFIX` (`flow`) · `TARGET_SERVICE` (`-`) · `FLOW_PLACEHOLDER` (`?`) · `FLOW_SEP` · `PAYLOAD_SEP` | Constants |
| `FlowError`, `FlowUnsupported`, `FlowTargetError`, `UnknownFlow`, `FlowStepError`, `FlowStepMissconfigured`, `UnknownFlowStep`, `UnknownTransition` | The error family, all registered with `ResilientError` |

## Defining a flow

A definition is data, not a class. Each step carries an `index`, its own `step` name, the `service`
it belongs to, and a map of transitions keyed by transition name:

```typescript
import type { ShallowFlow } from '@owlmeans/flow'

export const onboardingFlow: ShallowFlow = {
  flow: 'onboarding',
  initialStep: 'welcome',
  steps: {
    welcome: {
      index: 0,
      step: 'welcome',
      service: 'onboarding',
      initial: true,
      transitions: {
        next: { transition: 'next', step: 'profile' },
      },
    },
    profile: {
      index: 1,
      step: 'profile',
      service: 'onboarding',
      transitions: {
        next: { transition: 'next', step: 'done' },
        back: { transition: 'back', step: 'welcome', explicit: true, reversible: true },
      },
    },
    done: { index: 2, step: 'done', service: 'onboarding', transitions: {} },
  },
}
```

## Driving it

```typescript
const model = await makeFlowModel(onboardingFlow)   // an object needs no provider
model.transit('next', true)                          // → 'profile'
const token = model.transit('next', true)            // → 'done'; returns the SERIALIZED state

const restored = await makeFlowModel(token, provider)   // a token DOES need a provider
restored.step().step   // 'done'
```

## Rules

**`transit()` returns the serialized state, not the model.** It is the natural place to persist or
hand off from — a caller that ignores the return and calls `serialize()` afterwards gets the same
string, but the return is the signal that a transition is a checkpoint.

**A string argument is a flow name FIRST and a token second.** `makeFlowModel` asks the provider,
and only re-reads the string as a serialized token once the provider **throws**. A provider that
returns `null`/`undefined` for an unknown name therefore breaks every restore — it must throw
(`UnknownFlow` is what the built-ins raise).

**Passing a `ShallowFlow` object needs no provider at all.** That is the server-friendly path: a
runtime whose flows are code it declares itself needs no registry to start one, only to restore one.

**`next()` answers with the first non-explicit outgoing transition**, and throws
`UnknownFlowStep('next')` when the step offers none. It is what lets a driver advance without
knowing the vocabulary, so mark every user-chosen or exceptional edge `explicit` — an unmarked
second edge silently becomes reachable as the automatic answer.

**`enter(step?)` only accepts a step marked `initial`**, and throws `FlowStepError('initial:<step>')`
otherwise. That is what makes a flow's entry points an explicit part of its definition rather than
whatever the caller happens to name.

**`FlowPayload` holds flat scalars only** — `string | number | boolean | null | undefined`. Anything
richer belongs in a record the payload points at. Payload is projected through the step's
`payloadMap` on serialization, so an unmapped key does not survive a round trip and a step with no
`payloadMap` at all carries no payload across.

**`updatePayload` merges; `transit` also merges.** Neither replaces the payload, so a key set early
in a flow keeps arriving at every later step whose `payloadMap` names it.

**The live state is `flow` `step` `previous` `entityId` `service` `payload` `message` `ok`.**
`service` is the target the flow is running *for*, set through `target()`; `entityId` is set through
`entity()` and survives serialization even when it is explicitly `null`.

**`reversible` is what keeps `previous`**, and is what a "back" transition needs to return to where
it came from.

## Where it runs

Client drivers are `@owlmeans/client-flow` (`makeBasicFlowService`) and `@owlmeans/web-flow`
(`makeFlowService`, which supplies the browser redirect the basic service refuses); they load
definitions from `FLOW_RECORD` config records through the config resource and carry the serialized
state in a query parameter (`FlowConfig.queryParam`, defaulting to `flow`).

A step addresses its screen through `module` — the alias of the entrypoint the driver navigates to,
which is why a step is portable between apps that mount it at different paths. `service`, `module`
and `path` are plain strings, and a value prefixed with `$` is a reference resolved at load time
against `FlowConfig.services` / `modules` / `pathes` — which is how one definition is reused by
deployments that address different services. `TARGET_SERVICE` (`-`) in a step's `service` means
"whatever the state's own target is" rather than a named one.

A step with no `module` cannot be addressed, and the two client drivers raise
`FlowStepMissconfigured` at different moments: `FlowClient.proceed` in `@owlmeans/client-flow`
checks the step it is about to **enter**, before it transits; `FlowService.proceed` in
`@owlmeans/web-flow` checks the step the model is **standing on**. Either way the step named in the
error is the one missing the `module`.

There is **no server-side driver in this package**. A server or worker builds models directly from
`ShallowFlow` objects and supplies its own `FlowProvider` for restores — `@owlmeans/agent`'s
`makeStaticFlowProvider` is the reference implementation of one.

## Depends on

`@owlmeans/auth`, `@owlmeans/config`, `@owlmeans/error`, `@owlmeans/i18n`, `@owlmeans/resource`,
`@scure/base` (the token codec — base64url, no padding, over the JSON of `SerializedFlow`).

## Related

- [[client-flow]] — the client service and the runner a screen drives
- [[web-flow]] — the browser half: the `flow` query parameter and cross-service redirects
