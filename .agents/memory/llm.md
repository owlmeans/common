---
node: llm
scope: "packages/llm/**, packages/llm-common/**"
updated: 2026-11
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
- `LlmSpectator` logs model calls (`log`) and optionally captures null results, reports errors,
  and emits retry notices (`captureNull`, `error`, `notice`). The consumer owns trace storage,
  derivation, and updates.
- Live specs are gated via `@owlmeans/test` `makeGates` on `OPENROUTER_SECRET` / `ANTHROPIC_SECRET` /
  `OPENAI_SECRET` in the repo-root `.env` (documented in `.env.example`); with none set they self-skip.

## Invariants

- Provider differences are `LlmPlugin` members — `build` / `owns` / `family` / `refine` /
  `structuredMode` / `toolChoice` / `responseFormat` / `patchPrompt` / `loopCache` / `cacheDialect` / `isFatal`. No `instanceof`
  or `provider ===` branch may return to `model.ts` or `service.ts`.
- A web search (`LlmService.webSearch`) is a direct request to the provider — never through
  `llmTransportRegistry` or an SDK client — so an installed LLM proxy cannot reroute it; its dialect is
  `LlmPlugin.search`, declared per plugin and never in `openAiFamily` (a spread would send a gateway
  key to api.openai.com). Detail: skill `llm`, part `web-search`.
- Plugin **registration order is load-bearing**: `pluginFor` returns the first `owns` match, so
  `compatible` is registered before `openai` — both build a `ChatOpenAI`, and assuming tool-calling
  for an unlabelled model is safe everywhere while assuming native JSON-schema support is not.
- A raw or `bindTools`-bound model (tool loops) resolves its plugin with `llmPluginRegistry.resolveFor`
  (the configured provider first): `pluginFor` alone sends every `ChatOpenAI` to `compatible`.
- A `fallback` chain may cross providers: every provider-shaped decision (`refine`, structured
  mode, `tool_choice`, prompt rendering) comes from the ACTIVE rung's plugin, and `prepare`
  re-runs on a family change. Keyed on the primary's plugin, another provider's rung 400s on
  the first switched call. `resolveFallbacks` is the one merge (cross-provider rungs inherit
  only budgets). Detail: skill `llm`, "Fallback chains and provider effort".
- **`refine` runs on EVERY call, attempt 0 included** — a parameter a model rejects is gated in `build`
  AND `refine` (gating `build` only put `temperature` back and 400'd all of `gpt-5*`, fatal on the first
  call). Exported predicates, never re-typed: `rejectsSampling`, `usesResponsesApi`; `effort` likewise.
- The ladder is per CALL, so a caller whose own loop validates the OUTPUT must pass
  `LlmCallOptions.escalation` (its outer attempt) or every call restarts at rung 0 — same
  model, same budget, same deterministic answer. Clamped to `retries - 1`; start rung only.
- Escalation follows the failure CLASS: `attempt` picks the rung and stays `> 0` per retry (the delegate
  keys on it); budget/effort climb only on budget-fixable failures, never a schema refusal (`retries`).
- Liveness and OpenAI background mode are ATTEMPT-level: the observer (`LlmRefineParams.observe`) and
  `background: true` live only on `refine`'s instance, never `build` (built `modelKwargs` also drive the
  non-streamed `_generate` and tool loops; `transport.spec` pins build config). No AsyncLocalStorage.
- `maxTokensCap` is what the deployment budgets, `maxOutput` what the provider allows;
  `resolveOutputCap` takes the declared cap and trims it by the capability. A `fallback` that
  changes `model` must restate `contextWindow`/`maxOutput` — it inherits every unnamed field
  from a different model.
- `createModel` layers `presetOf(base.preset) < base < presetOf(override.preset) < override`.
  A preset is a BASE; assigning it last (the old order) silently voided a role's own fields
  and the caller's override, including effort-tier caps. One level deep, never a chain.
- `ExecutionPlugin` is **`advise`-only** (no checkpoint/restore): an execution is a COLLABORATOR rebuilt
  per run; resumability is `@owlmeans/agent`'s run row. `TaskExecutionState.{phase,completed,cursor}` are labels.
- The inquiry transport registry is module-level and keyed, exactly like the provider-plugin and
  delegate registries beside it, and its accessor is named `inquiryTransportFor` — `@owlmeans/llm`
  and `@owlmeans/llm-delegate` are re-exported into one namespace by `@owlmeans/viable`, so a bare
  `transportFor` collides. A transport that cannot serve a question THROWS (`InquiryUnavailable`,
  registered fatal beside the throw); a declined answer is a decision and is not fatal.
- `use()` seats a plugin **by alias**, replacing rather than appending. A layer wired twice
  otherwise answers twice, silently, since the first usable answer wins.
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
- Claude 5-series models reason ADAPTIVELY whether or not the request asks, and it is billed from
  the same `max_tokens` as the answer — a budget sized for the answer alone comes back as a
  thinking-only completion with `stop_reason: "max_tokens"` and no text block. `ADAPTIVE_MIN_MAX_TOKENS`
  (32k, clamped through `resolveOutputCap`) is the floor that prevents it. Escalating `maxTokens`
  alone does not: the retry redraws from an unchanged distribution.
- Anthropic never sets `response_metadata.finish_reason`; langchain puts the stop reason in
  `additional_kwargs.stop_reason`. Reading only the former printed `finishReason: undefined` on
  every Anthropic null report, hiding the cause above.
- The OpenAI SDK's SSE reader swallows an AbortError-shaped body error into a short "success" and fails
  on a half event flushed at end of stream: a wrapper around a provider body errors with
  `LlmModelError('stream-stalled:…')` and forwards complete SSE records only.
- An empty completion is classified as a null result BEFORE the caller's filter runs. Every shipped
  filter returns null only for empty input, so letting one run first blamed the caller and skipped
  `reportNull` — losing the only diagnostics that explain the failure.

## Pointers

- `packages/llm/README.md` — the resilience table and the plugin-authoring example.
- Skills: `llm`, `llm-common` and `inquiry` (the transport registry and `ExecutionService.ask`).
  The `ModelProvider.Delegated` runtime is `@owlmeans/llm-delegate` in the `internal` monorepo —
  contracts here, runtime there; consumers reach it through `@owlmeans/viable`.
- Consumer side: `viable-agent` skills `/llm-model` and `/execution`.
- `@langchain/anthropic` 1.5.8 validates its UNSENT `thinking: disabled` default: Opus 5/5.5 at `xhigh`/`max`
  threw locally (retried to exhaustion); `withLocalThinking` sets it to `adaptive` on the 5 family (the
  SDK type lacks `between_tools`, langchain forwards the object unchanged).
- Sonnet 5.5, Opus 5.5 and Fable/Mythos 5.1 answer a pinned `tool_choice` with a 400, and Opus 5.5 /
  Fable 5 / Mythos 5 refuse every thinking off switch — before the per-family table the plugin sent
  `disabled` to all of them under `disableThinking` (verified live 2026-09-29: Sonnet 5.5 at
  `between_tools` + `auto` + `strict` → 200).
- `@langchain/openai` 1.5.x sends constructor `reasoning` only for `o*`/`gpt-5*`: `gpt-6-*` effort lives in
  `modelKwargs.reasoning`. Non-strict `json_schema` hides validation keywords (stated in descriptions now)
  and any PROPERTY named like one (refused up front) — each gave eight identical validation failures.
