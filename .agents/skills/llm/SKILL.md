---
name: llm
description: How to use @owlmeans/llm — the LLM inference runtime (four-method model, provider plugins, model factory service, policy-driven execution abstraction, and the prompt/skill composition service). Auto-invoked when importing the model, an LlmPlugin, the LlmService, the execution service, or the prompt service.
user-invocable: false
---

# @owlmeans/llm

**Layer:** Core
**Install:** `"@owlmeans/llm": "^0.1.18-rc.10"` in `dependencies` (plus the `@langchain/*` peers)

The inference runtime. Everything provider-specific is a **plugin**; the model itself only
owns the provider-independent parts (streaming discipline, retries, validation,
observability). Serializable contracts live in `@owlmeans/llm-common`.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeLlmModel(options, spectator)` | The four-method model: `ask` / `talk` / `invoke` / `request`. |
| `makeLlmService(options, alias?)` · `appendLlmService(ctx, options, alias?)` | Model factory/registry — resolves a `ModelConfig` by alias, memoized per alias+override. |
| `llmServiceApi(options, self)` | The factory half WITHOUT `createService`, to compose into your own service (role accessors, domain helpers). |
| `makeExecutionService(alias?, options?)` · `appendExecutionService(ctx, alias?, options?)` | Frozen 3-level executions + policy resolution + snapshot/restore/checkpoint + advice. |
| `makePromptService(options?, alias?)` · `appendPromptService(ctx, options?, alias?)` · `promptServiceApi(options, self)` | Skill registry + the composition plugin chain. Also at `@owlmeans/llm/prompt`. |
| `rolePlugin`, `skillsPlugin`, `contextPlugin`, `BUILT_IN_PROMPT_PLUGINS` | The built-in composition plugins. |
| `renderSkill`, `sortSkills`, `joinChunks`, `compareAlias`, `prefixHash` | Deterministic rendering primitives — reuse them, never re-implement. |
| `readCacheUsage`, `hasCacheActivity` | Normalized prompt-cache accounting from a completion. |
| `executionServiceApi(options, self)` | The execution half without `createService`, for the same composition pattern. |
| `plugins`, `registerLlmPlugin`, `resolvePlugin`, `pluginOf`, `pluginFor` | The provider-plugin registry. Also at `@owlmeans/llm/plugins`. |
| `anthropicPlugin`, `openAiPlugin`, `compatiblePlugin`, `openAiFamily` | Built-in providers; `openAiFamily` is the shared OpenAI-client behaviour to spread into a new plugin. |
| `NO_SAMPLING_PREFIXES`, `rejectsSampling(model)` | Which Claude families reject `temperature`/`top_p`/`top_k` (4.7+ and the 5 family). Consumers pin presets against it. |
| `RESPONSES_API_PREFIXES`, `usesResponsesApi(model)` | Which OpenAI families go through the Responses API and therefore reject `temperature`/`top_p` (`gpt-5*`, `codex-*`). The OpenAI counterpart of the pair above; consumers pin presets against it. |
| `withRetry`, `registerFatalError`, `spectate`, `normalizeInput`, `parseJsonContent`, `coerceToSchema` | Helpers usable alongside a model. Also at `@owlmeans/llm/helpers`. |
| `LlmError`, `LlmModelError`, `LlmMissconfiguredError`, `LlmPluginError`, `LlmRetryExceededError` | `ResilientError` family. `LlmModelError` is the RETRYABLE one. |
| `mergePrompt`, `mergePolicy`, `resolveRole`, `effortPatch` | Execution merge helpers; `mergePrompt` unions skills and takes the deepest role. |
| `DEFAULT_MODEL_RETRIES`, `MODEL_STREAM_TIMEOUT_MS` (3 min idle), `FALLBACK_AFTER_ATTEMPTS`, `DEFAULT_EFFORT`, `EFFORT_TABLE`, `MAX_CACHE_BREAKPOINTS`, `MAX_SYSTEM_BREAKPOINTS`, `MIN_CACHEABLE_TOKENS`, `LLM_SERVICE`, `EXECUTION_SERVICE`, `PROMPT_SERVICE` | Tuning + aliases. |

## helpers/ vs utils/ — the rule this package follows

- `src/helpers/` — functions a **consumer** may use alongside a model. Exported.
- `src/utils/` — used only inside the library. **Never exported**; a spec that needs one
  imports it from `../src/utils/…`.

Adding a function? Decide which side it belongs to first, then place it. Do not export a
`utils/` symbol "because a test needs it".

## Provider differences are plugins, never `if`s

`LlmPlugin` is the single seam. If you find yourself writing `instanceof ChatAnthropic` or
`config.provider === …` in `model.ts` or `service.ts`, it belongs on the plugin instead:

| Plugin member | Replaces |
|---|---|
| `build` | the provider switch in the model factory |
| `owns` / `family` | `instanceof` checks; `family` gates cross-provider fallback |
| `refine` | the per-provider retry rebuild (budget doubling, reasoning shrink) |
| `structuredMode` | native `response_format` vs the forced-tool-call hack |
| `toolChoice` / `responseFormat` | the provider-specific call shapes |
| `patchSystem` | how the composed system blocks are rendered and where their cache breakpoints go |
| `patchCache` | the message-prefix cache marker |
| `cacheKey` (via `ModelConfig.cacheKey`) | provider cache-routing hints such as OpenAI's `prompt_cache_key` |
| `isFatal` | "this error can never be retried" |

### A provider that removes a parameter is a plugin concern too

`build` is not the only place a parameter reaches the wire, and `refine` is not only a retry
hook — **every** call is made on the instance `refine` returns, attempt 0 included. A knob
suppressed in `build` and re-applied in `refine` therefore ships on every single request, not
on a retry: an unsupported `temperature` restored there 400s the model's whole family on the
first call, and `isFatal` correctly refuses to retry it, so the failure is immediate and total.

Both built-in plugins gate their rejected parameters in **both** hooks, through a predicate the
package root exports:

| Family | Rejects | Predicate |
|---|---|---|
| Claude 4.7+ and the 5 family | `temperature`, `top_p`, `top_k` | `NO_SAMPLING_PREFIXES` / `rejectsSampling(model)` |
| OpenAI Responses API (`gpt-5*`, `codex-*`) | `temperature`, `top_p` | `RESPONSES_API_PREFIXES` / `usesResponsesApi(model)` |

Models below those lines keep the deterministic `temperature: 0` default. `refine` reads the
id off the ACTIVE base (`model.model ?? lc_kwargs.model`), so a same-family `fallback` rung is
judged on its own id rather than the primary's, and the OpenAI check also accepts a
`useResponsesApi` already on `lc_kwargs`.

Export the predicate rather than keeping it private: consumers pin presets against it
(`viable-agent`'s `tests/presets.test.ts` asserts no preset entry declares a parameter its
model rejects), and a second hand-written copy of the list drifts exactly when a new family is
added — the moment it has to be right.

**Registration order is load-bearing.** Instance-based lookup (`pluginFor`) returns the
FIRST plugin whose `owns` matches. `compatible` is registered before `openai` because both
build a `ChatOpenAI`, and assuming the tool-calling hack for an unlabelled model is safe
everywhere while assuming native JSON-schema support is not.

## System prompts: a role and skills, never a hand-built message

`makeLlmModel` takes `prompt` (a `PromptInput`) and a `prompts` resolver. The prompt service
composes them into an ordered, cacheable system message; a caller's own leading
`SystemMessage` is folded into the volatile `Context` block, so an unmigrated call site
still works. **Do not build a persona as a `SystemMessage` in a helper** — declare it as
`PromptPolicy.role` plus registered skills, or the knowledge duplicates and the cache
prefix stops being stable.

Skills accumulate down the execution chain (project → task → helper) and the deepest
declared `role` wins — see `mergePrompt`. Full rules, breakpoint budget and the provider
facts behind them: [[llm-prompt-caching]].

## Execution: policy in, model out

```
ProjectExecution   ← root: policy + purpose + models resolver
  └─ TaskExecution    ← + resumable state (phase/cursor/completed/data)
       └─ HelperExecution ← + a RESOLVED model + temperatureFactory, bound to a role
```

`prompt` (role + skills) travels on `ExecutionState`, so it survives snapshot/restore;
`prompts` and `files` are collaborators and never enter a snapshot.

Every method returns a NEW `Object.freeze`d object. Resolution precedence in
`model(exec, role, override)`: **roleOverride → modelOverride → effort tier →
`LlmService.getModel`**. `escalate(exec, { effort })` raises the tier once and cascades to
everything derived from it.

Extending it for a domain: declare your own `Execution`/input types, list your collaborator
fields in `ExecutionServiceOptions.collaboratorKeys` so they stay out of snapshots, and
instantiate the service generic with your own `ExecutionShape` — **do not narrow the
inherited method signatures**, which would be a contravariance error.

`snapshot` excludes `state` itself; without that, every `derive`/`escalate`/`withPurpose`
on a task would nest another copy of the previous state.

`forHelper` also accepts `output` — an initial `maxTokens` for a helper whose one answer is
genuinely large (a whole source file rather than a decision). It is a model selector, not a
field the helper carries: it becomes a call override, is clamped to `maxOutput`, doubles from
there under retry, and survives `temperatureFactory`.

### The plugin seam has two hooks, dispatched independently

`ExecutionPlugin` carries `onCheckpoint`/`onRestore` (persist and resume an
`ExecutionState`) and `advise` (answer a performer's question about the project it is
working in — `ExecutionService.advise(exec, request)`, first usable answer wins, a throwing
plugin is skipped, `null` when nobody answers). Advice is advisory by contract: a caller
appends whatever comes back and proceeds unchanged on `null`.

`checkpoint` dispatches on plugins that declare **`onCheckpoint`**, not on the plugin count —
otherwise registering an advise-only plugin would silently start composing snapshots nobody
consumes.

## Classify a provider error by walking `cause`, never by `instanceof` or a surface read

Two independent layers hide the wire shape of a provider failure, and each one alone is
enough to make a fatal error look retryable — which costs all eight attempts with the real
message buried under the repeats.

1. **Nested SDK copies.** `@langchain/anthropic` and `@langchain/openai` bundle their OWN
   copies of the provider SDKs, so an error they throw is an instance of a DIFFERENT class
   than the one this package imports — `e instanceof BadRequestError` silently returns
   `false`.
2. **Langchain's own error wrappers.** A failure is re-wrapped in a typed langchain error
   (`ContextOverflowError` for an input past the context window, and its siblings) that
   carries the original **only under `cause`** and has no `status` of its own — so
   `e.status === 400` misses it too.

Use `isBadRequest` from `plugins/utils.ts`: it walks the `cause` chain looking for
`status === 400`, bounded in depth so a self-referential chain terminates. Both built-in
`isFatal` implementations go through it.

A context overflow is the case that makes this urgent rather than merely untidy: `refine`
escalates the **output** budget on each retry, so an over-limit **input** can never improve —
every attempt re-sends the identical oversized request. Consumers hold their locks for the
whole loop, so a single unfixable call becomes minutes of thrash on the caller's side.

The same trap applies to any cross-copy `instanceof`; it is the runtime face of the
peer-dependency identity rule below.

## Peer-dependency rule (langchain identity)

`@langchain/core`, `@langchain/openai` and `@langchain/anthropic` are **peer** dependencies:
model instances cross the package boundary, and two installed copies of a class with
protected members are nominally distinct types. In a linked-workspace checkout the consumer
must pin them to a single copy — see the `bun-linked-workspaces` skill.

## Usage

```typescript
import { makeLlmModel, makeLlmService } from '@owlmeans/llm'
import { ModelProvider } from '@owlmeans/llm-common'

const llm = makeLlmService({ models: () => configs })
const model = makeLlmModel(
  { model: llm.getModel('analyst'), purpose: { type: 'analysis' } }, spectator
)
const spec = await model.invoke('Describe the app', SpecSchema, { action: 'spec' })
```

## Hangs are bounded by an IDLE deadline, not a total one

A stalled provider is aborted after `MODEL_STREAM_TIMEOUT_MS` (3 min) of SILENCE and
surfaces as a retryable `LlmModelError`, so the escalator moves on. The timer re-arms on
every token, so a long-but-productive generation is never cut off — which is why the value
can be low. Set it for a whole deployment with `LlmServiceOptions.streamTimeout` where the
application composes its context; a preset that names its own `ModelConfig.streamTimeout`
keeps it.

Note what this does NOT bound: a call that keeps streaming forever, and retries. A fatal
error misclassified as retryable multiplies its own latency by `DEFAULT_MODEL_RETRIES` —
see the `instanceof` trap above.

## An outer validation loop must pass its attempt in

A caller that validates the OUTPUT — a diff that has to apply, a file that must not come
back truncated — runs its own retry loop around whole `ask` calls. Every one of those calls
starts a FRESH inner loop at attempt 0, so the escalator's two rungs never move: same model,
same output budget, same deterministic answer, N times. Pass `escalation: <outer attempt>`
in `LlmCallOptions` and the per-call escalator starts that far up its ladder instead —
`maxTokens` doubling and the `FALLBACK_AFTER_ATTEMPTS` switch to `ModelConfig.fallback` both
advance. It is clamped to `retries - 1`, moves the STARTING rung only, and never changes how
many attempts the call itself makes.

Two things this depends on, and both are preset data rather than code: the role must
actually declare a `fallback`, and that fallback must be in the same plugin `family` (a
cross-family one is skipped with a warning, because switching provider mid-call flips the
structured-output shape).

`LlmCallOptions.fatal` is the matching lever in the other direction — a per-call resolver
consulted before the global ones and the plugin's `isFatal`, for an error the caller knows
no retry can fix.

## Output caps: what the deployment wants vs what the provider allows

Four fields, and conflating them is what turns an escalation into a fatal 400 hours into a
run:

| Field | Means |
|---|---|
| `maxTokens` | the budget asked for on the FIRST attempt |
| `maxTokensCap` | the ceiling the deployment budgets for the escalator |
| `maxOutput` | what the PROVIDER accepts in one request — a fact about the model |
| `contextWindow` | total window (input + output); informational, never sent |

`resolveOutputCap` (`utils/config.ts`) is the one place that reconciles them: the declared
cap chooses the ceiling and the capability trims it, and `DEFAULT_MAX_OUTPUT_CAP` applies
only when neither is stated. `createModel` additionally clamps `maxTokens` to `maxOutput`
and warns about a cap above it. For an aggregated model `maxOutput` is the limit of the
`inferenceProvider` actually pinned, which is often far below what the model can do
elsewhere. `combinedWindow: true` marks a model whose window is shared between input and
output (MiniMax M2.x, gpt-oss) — nothing enforces it at runtime; it keeps presets honest
about leaving room for the prompt.

**A `fallback` that changes `model` must restate `contextWindow`/`maxOutput`** (and reset
`combinedWindow`): the fallback config is `{...primaryConfig, ...fallback}`, so every field
the patch does not name is inherited from a different model.

## Config precedence: a preset is a base, not a final word

`createModel` layers four sources, lowest first:

    presetOf(base.preset)  <  base  <  presetOf(override.preset)  <  override

A `preset` is a BASE that its referent refines, so it sits UNDER the config naming it.
Assigning it last — as this did until the layering was fixed — meant a role declaring
`preset:` silently discarded both its own fields and the caller's override, which is how
effort-tier token caps and `temperatureFactory`'s temperature vanished for preset-based
roles. An override naming a preset (how the execution layer delivers a `modelOverrides`
string pin) outranks the alias but still yields to explicit override fields. Resolution is
ONE level deep: a preset meant to carry a model must name one.

## Resilience already handled — do not reimplement

Idle stream deadline · duplicate-final-chunk dedup · output-budget escalation · reasoning-cap
shrink · same-family fallback model · caller-seeded ladder position (`escalation`) · schema
coercion · JSON salvage from prose · `NullCapture`
diagnostics · fatal-error short-circuit · blank-content sanitization (whitespace-only text
blocks are dropped before every call — a blank block, e.g. an empty file read pasted into a
prompt, is otherwise a fatal Anthropic 400; blank tool results are stubbed to keep their
`tool_use` pairing). Details: package `README.md`.

## Tests

`bun test ./tests` in the package. Offline specs always run; `tests/model.spec.ts` is gated
on `OPENROUTER_SECRET` / `ANTHROPIC_SECRET` in the repo-root `.env` and self-skips otherwise.

## Depends On

- `@owlmeans/llm-common` · `@owlmeans/context` · `@owlmeans/error` · `@owlmeans/basic-ids` · `ajv`
- peer `@langchain/core`, `@langchain/openai`, `@langchain/anthropic`

## Related

- [[llm-common]] — the serializable contracts
- [[llm-prompt-caching]] — prompt composition, block order and the cache invariants
- [[context]] — service registration · [[error]] — the `ResilientError` family
