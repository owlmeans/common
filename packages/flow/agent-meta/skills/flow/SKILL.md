---
name: flow
description: How to use @owlmeans/flow — a serializable step/transition state machine whose whole state collapses to one string. Auto-invoked when importing from this package, driving a multi-step workflow, or restoring one from a token.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/flow

**Layer:** Cross-cutting domain
**Install:** `"@owlmeans/flow": "^0.1.18-rc.11"` in `dependencies`

A flow is a set of named **steps**, each offering named **transitions** to other steps. What makes
it worth using over a hand-rolled switch is that the whole live state — flow, step, previous step,
entity, payload, message, ok — serializes to a single compact string and restores from it. That is
what lets a workflow survive a redirect, a page load, or a process.

## Key exports

| Export | Description |
|---|---|
| `makeFlowModel(flow, provider?)` | Build a driver. `flow` is a `ShallowFlow` **object** (no provider needed) or a **string** — tried as a flow name first, then as a serialized token. |
| `FlowModel` | `target` `entity` `enter` `steps` `state` `setState` `payload` `updatePayload` `step` `transitions` `transition` `next` `transit` `serialize` |
| `ShallowFlow` / `FlowStep` / `FlowTransition` / `FlowState` / `FlowPayload` | The definition and state shapes |
| `FlowProvider` | `(flow: string) => Promise<Flow>` — resolves a flow by name |
| `flow(cfg, shallowFlow)` · `configureFlows(cfg, config)` | Register a flow as a config record / set `FlowConfig` |
| `stdStabFlow`, `stdAuthFlow` (deprecated), the OIDC/OIDP flows | Built-in flows |
| `FlowError`, `UnknownFlow`, `UnknownFlowStep`, `UnknownTransition`, … | The error family |

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

**`next()` requires exactly one non-explicit outgoing transition.** It is what lets a driver advance
without knowing the vocabulary; mark every user-chosen or exceptional edge `explicit` so it can
never become the automatic answer.

**`FlowPayload` holds flat scalars only** — `string | number | boolean | null | undefined`. Anything
richer belongs in a record the payload points at. Payload is projected through the step's
`payloadMap` on serialization, so an unmapped key does not survive a round trip.

**`reversible` is what keeps `previous`**, and is what a "back" transition needs to return to where
it came from.

## Where it runs

Client drivers are `@owlmeans/client-flow` (`makeFlowService`) and `@owlmeans/web-flow`; they load
definitions from `FLOW_RECORD` config records through the config resource and carry the serialized
state in a query parameter (`FlowConfig.queryParam`).

There is **no server-side driver in this package**. A server or worker builds models directly from
`ShallowFlow` objects and supplies its own `FlowProvider` for restores — `@owlmeans/agent`'s
`makeStaticFlowProvider` is the reference implementation of one.

## Depends on

`@owlmeans/auth`, `@owlmeans/config`, `@owlmeans/error`, `@owlmeans/i18n`, `@owlmeans/resource`,
`@scure/base` (the token codec).
