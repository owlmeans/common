---
node: llm
scope: "packages/llm/**, packages/llm-common/**"
updated: 2026-08
---

# LLM (inference runtime + execution abstraction)

Extracted from `viable-agent` so any OwlMeans app can drive an LLM. `llm-common` holds the
serializable contracts (no langchain runtime); `llm` holds the model, the provider plugins, the
model factory service and the generic execution service. Related: [[versioning]].

## Facts

- The `helpers/` vs `utils/` split is the package's organising rule: `helpers/` = usable by a
  consumer (exported, plus a `./helpers` subpath); `utils/` = library-private, never exported. A
  spec that needs a util imports it from `../src/utils/…`.
- `llmServiceApi` / `executionServiceApi` return the implementation WITHOUT `createService`, so a
  consumer composes them into its own service (role accessors, observability factories). Both take
  a `() => service` late-binding accessor.
- Observability is a one-method sink (`LlmSpectator`: `log`, optional `captureNull`). Anything
  richer (storage, `derive`, `update`) belongs to the consumer.
- Live specs are gated via `@owlmeans/test` `makeGates` on `OPENROUTER_SECRET` / `ANTHROPIC_SECRET`
  in the repo-root `.env` (documented in `.env.example`); with none set they self-skip.

## Invariants

- Provider differences are `LlmPlugin` members — `build` / `owns` / `family` / `refine` /
  `structuredMode` / `toolChoice` / `responseFormat` / `patchCache` / `isFatal`. No `instanceof`
  or `provider ===` branch may return to `model.ts` or `service.ts`.
- Plugin **registration order is load-bearing**: `pluginFor` returns the first `owns` match, so
  `compatible` is registered before `openai` — both build a `ChatOpenAI`, and assuming tool-calling
  for an unlabelled model is safe everywhere while assuming native JSON-schema support is not.
- Retry escalation switches to `ModelConfig.fallback` only WITHIN one plugin `family`: a
  cross-provider switch mid-call would change the structured-output call shape.
- **`refine` runs on EVERY call, attempt 0 included** — it is the instance the provider is
  actually asked with, not a retry-only rebuild. A parameter a model rejects must therefore be
  gated in `build` AND `refine`: gating only `build` put `temperature` back on every request and
  400'd the whole `gpt-5*` family (`Unsupported parameter: 'temperature'`) — fatal by `isFatal`,
  so the first call of a run died. Predicates are exported, one per family, never re-typed by a
  consumer: `rejectsSampling` (Claude 4.7+/5) and `usesResponsesApi` (`gpt-5*`/`codex-*`).
- The ladder is per CALL, so a caller whose own loop validates the OUTPUT must pass
  `LlmCallOptions.escalation` (its outer attempt) or every call restarts at rung 0 — same
  model, same budget, same deterministic answer. Clamped to `retries - 1`; start rung only.
- `maxTokensCap` is what the deployment budgets, `maxOutput` what the provider allows;
  `resolveOutputCap` takes the declared cap and trims it by the capability. A `fallback` that
  changes `model` must restate `contextWindow`/`maxOutput` — it inherits every unnamed field
  from a different model.
- `createModel` layers `presetOf(base.preset) < base < presetOf(override.preset) < override`.
  A preset is a BASE; assigning it last (the old order) silently voided a role's own fields
  and the caller's override, including effort-tier caps. One level deep, never a chain.
- `ExecutionPlugin` has `onCheckpoint`/`onRestore` AND `advise`; `checkpoint` dispatches on
  plugins declaring `onCheckpoint`, never on the plugin count, so an advise-only plugin does
  not start composing unused snapshots.
- `composeExecState` excludes `state` itself. Without it every `derive`/`escalate`/`withPurpose`
  on a task nests another copy of the previous state (regression-tested in `execution.spec.ts`).
- `@langchain/*` are **peer** dependencies: model instances cross the package boundary and two
  installed copies of a protected-member class are nominally distinct types.

## Gotchas

- A consumer extending the execution must instantiate the service generic with its own
  `ExecutionShape` — narrowing an inherited method signature is a contravariance error. For the
  same reason a consumer's `Execution` should satisfy the generic one structurally rather than
  `extends` it (redeclaring `purpose`/`models` with narrower types otherwise trips TS2320).
- `readConfig` returns `{}` for a REFINED model (rebuilt from `lc_kwargs`, metadata not preserved),
  which is why the config and plugin are resolved once from the ORIGINAL instance.
- The `gpt-5*` / `codex-*` families go through the Responses API, which rejects
  `temperature`/`topP` — an offline spec asserting on sampling params must not use them.

## Pointers

- `packages/llm/README.md` — the resilience table (what the package already handles) and the
  plugin-authoring example; skills `llm` / `llm-common`.
- Consumer side: `viable-agent` skills `/llm-model` and `/execution`.
