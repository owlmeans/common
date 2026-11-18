---
node: llm
scope: "packages/llm/**, packages/llm-common/**"
updated: 2026-11
---

# LLM (inference runtime + execution abstraction)

`llm-common`: serializable contracts (no langchain runtime); `llm`: the model, provider plugins, the
model factory service, the generic execution service. Related: [[versioning]].

## Facts

- The `helpers/` vs `utils/` split is the package's organising rule: `helpers/` = usable by a
  consumer (exported, plus a `./helpers` subpath); `utils/` = library-private, never exported. A
  spec that needs a util imports it from `../src/utils/…`.
- `llmServiceApi` / `executionServiceApi` return the implementation WITHOUT `createService`, so a
  consumer composes them into its own service (role accessors, observability factories). Both take
  a `() => service` late-binding accessor.
- Observability is a one-method sink (`LlmSpectator`: `log`, optional `captureNull`). Anything
  richer (storage, `derive`, `update`) belongs to the consumer.
- Live specs are gated via `@owlmeans/test` `makeGates` on `OPENROUTER_SECRET` / `ANTHROPIC_SECRET` /
  `OPENAI_SECRET` in the repo-root `.env` (documented in `.env.example`); with none set they self-skip.

## Invariants

- Provider differences are `LlmPlugin` members — `build` / `owns` / `family` / `refine` /
  `structuredMode` / `toolChoice` / `toolCalling` / `toolCallsOf` / `responseFormat` / `patchPrompt` / `loopCache` /
  `cacheDialect` / `isFatal`. No `instanceof` or `provider ===` branch may return to `model.ts` or `service.ts`.
- A call without `LlmCallTools` sends byte-identical requests (`tests/tool-golden.ts`, never re-recorded).
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
- **`refine` runs on EVERY call, attempt 0 included**: a parameter a model rejects is gated in
  `build` AND `refine`, or it returns on every request (`Unsupported parameter: 'temperature'`, fatal,
  the run's first call dies). Family predicates are exported, never re-typed: `rejectsSampling`
  (Claude 4.7+/5), `usesResponsesApi` (`gpt-6*`/`gpt-5*`/`codex-*`). `effort`: `build` clamps, `refine` climbs.
- The ladder is per CALL, so a caller whose own loop validates the OUTPUT must pass
  `LlmCallOptions.escalation` (its outer attempt) or every call restarts at rung 0 — same
  model, same budget, same deterministic answer. Clamped to `retries - 1`; start rung only.
- `maxTokensCap` is what the deployment budgets, `maxOutput` what the provider allows;
  `resolveOutputCap` takes the declared cap and trims it by the capability. A `fallback` that
  changes `model` must restate `contextWindow`/`maxOutput` — it inherits every unnamed field
  from a different model.
- `createModel` layers `presetOf(base.preset) < base < presetOf(override.preset) < override`: a preset
  is a BASE (last, it voids a role's own fields and the override). One level deep, never a chain.
- `ExecutionPlugin` is **`advise`-only**. The `onCheckpoint`/`onRestore` pair and
  `ExecutionService.checkpoint` are gone: an execution is a COLLABORATOR rebuilt per run, not a
  thing that is restored, and resumability belongs to `@owlmeans/agent`'s pipeline runner, whose
  run row is the authority. `TaskExecutionState.{phase,completed,cursor}` survive as LABELS for
  traces and prompts — never as a position anything resumes from.
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
- Tools "called with `{}`" in a round of several parallel calls → the stream's argument deltas carried no
  usable position (seen through a proxy on the Responses API) and langchain joins them by position →
  read calls through `toolCallsHelper` (the record in `response_metadata.output` wins by call id).
- Through some proxies a model keeps calling tools under `tool_choice: 'none'`, and a forced `any` is
  ignored (an `invoke` answered in words) → `ask`'s answer-now turn binds no tool at all; `invoke` is
  re-asked with its output tool pinned by name.
- Claude 5-series models reason ADAPTIVELY whether or not the request asks, and it is billed from
  the same `max_tokens` as the answer — a budget sized for the answer alone comes back as a
  thinking-only completion with `stop_reason: "max_tokens"` and no text block. `ADAPTIVE_MIN_MAX_TOKENS`
  (32k, clamped through `resolveOutputCap`) is the floor that prevents it. Escalating `maxTokens`
  alone does not: the retry redraws from an unchanged distribution.
- Anthropic never sets `response_metadata.finish_reason`; langchain puts the stop reason in
  `additional_kwargs.stop_reason`. Reading only the former printed `finishReason: undefined` on
  every Anthropic null report, hiding the cause above.
- An empty completion is classified as a null result BEFORE the caller's filter runs. Every shipped
  filter returns null only for empty input, so letting one run first blamed the caller and skipped
  `reportNull` — losing the only diagnostics that explain the failure.

## Pointers

- `packages/llm/README.md` — the resilience table (what the package already handles) and the
  plugin-authoring example; skills `llm` / `llm-common`.
- Skills: `llm`, `llm-common` and `inquiry` (the transport registry and `ExecutionService.ask`).
  The `ModelProvider.Delegated` runtime is `@owlmeans/llm-delegate` in the `internal` monorepo —
  contracts here, runtime there; consumers reach it through `@owlmeans/viable`.
- Consumer side: `viable-agent` skills `/llm-model` and `/execution`.
- `@langchain/anthropic` 1.5.8 validates its own UNSENT `thinking: disabled` default: an Opus 5/5.5
  call at `xhigh`/`max` with no `thinking` set threw locally (not a 400, so retried to exhaustion).
  The plugin sets the unsent field to `adaptive` on the 5 family (`withLocalThinking`); the SDK's
  `ThinkingConfigParam` has no `between_tools`, but langchain forwards the object unchanged.
- Sonnet 5.5, Opus 5.5 and Fable/Mythos 5.1 answer a pinned `tool_choice` with a 400, and Opus 5.5 /
  Fable 5 / Mythos 5 refuse every thinking off switch — hence the per-family table (Sonnet 5.5 takes
  `between_tools` + `auto` + `strict`).
- `@langchain/openai` 1.5.x sends its constructor `reasoning` only for `o*`/`gpt-5*` names, so a
  `gpt-6-*` effort rides `modelKwargs.reasoning`. OpenAI's non-strict `json_schema` hides a PROPERTY
  named `required` from the model — such a schema is refused up front.
