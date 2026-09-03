# @owlmeans/llm

LLM inference runtime for OwlMeans applications: a resilient four-method model over any
LangChain chat model, a provider-plugin layer, a model factory service, and an execution
abstraction that resolves models from an inheritable policy.

## Overview

- **Model** — `ask` / `talk` / `invoke` / `request` with streaming under an idle deadline,
  retry with an escalating output budget, schema validation and coercion, observability
  and full diagnostics when a call returns nothing usable
- **Plugins** — everything provider-specific (client construction, retry refinement,
  structured-output mode, `tool_choice` spelling, prompt caching, fatal-error rules) lives
  in a replaceable `LlmPlugin`; Anthropic, OpenAI and OpenAI-compatible ship built in
- **Service** — `LlmService` builds and memoizes models from a config list, with preset
  inheritance and a stronger `fallback` model attached for retry escalation
- **Execution** — frozen, three-level (`Project` → `Task` → `Helper`) execution objects
  carrying a `ModelPolicy`, plus snapshot / restore / checkpoint for resumable workflows

## Installation

```bash
bun add @owlmeans/llm@^0.1.18-rc.12 @owlmeans/llm-common@^0.1.18-rc.11
bun add @langchain/core @langchain/openai @langchain/anthropic   # peer dependencies
```

The `@langchain/*` packages are **peer dependencies** on purpose: model instances cross the
package boundary, and two copies of a class with protected members are nominally distinct
types. Your app must provide exactly one copy.

## Usage

### Resolve a model and talk to it

```typescript
import { makeLlmService, makeLlmModel } from '@owlmeans/llm'
import { ModelProvider } from '@owlmeans/llm-common'

const llm = makeLlmService({
  models: () => [{
    alias: 'analyst',
    provider: ModelProvider.Compatible,
    model: 'z-ai/glm-5.1',
    secret: process.env.OPENROUTER_SECRET!,
    baseUrl: 'https://openrouter.ai/api/v1',
    maxTokens: 8192,
    maxTokensCap: 32000,
    reasoning: { max_tokens: 1024 },
  }],
})

const model = makeLlmModel(
  { model: llm.getModel('analyst'), purpose: { type: 'analysis' } },
  spectator,          // any { log, captureNull? } sink
)

const text = await model.ask('Summarise this changelog', { action: 'summarise' })
const spec = await model.invoke('Describe the app', SpecSchema, { action: 'spec' })
```

### Drive it through an execution

An execution carries the policy, so a caller never picks a model by name:

```typescript
import { appendExecutionService, appendLlmService, DEFAULT_EFFORT } from '@owlmeans/llm'
import { ExecutionEffort } from '@owlmeans/llm-common'

appendLlmService(context, { models: () => configs })
appendExecutionService(context)

const root = context.executions().root({
  models: () => context.llm(),
  policy: { effort: DEFAULT_EFFORT },
  purpose: { type: 'ingest' },
})

// Refine downward — each step returns a NEW frozen object.
const task = context.executions().forTask(root, { phase: 'draft' })
const helper = context.executions().forHelper(task, { role: 'analyst', dedication: 'summary' })
// A hard sub-step runs on a stronger tier without touching the branch it came from:
const harder = context.executions().escalate(task, { effort: ExecutionEffort.High })
```

Resolution precedence in `executions().model(exec, role, override)`:
**roleOverride → modelOverride → effort tier → `LlmService.getModel`**.

### Persist and resume

```typescript
context.executions().use({
  onCheckpoint: async (state, _exec, key) => queue.put(key!, JSON.stringify(state)),
  onRestore: async key => JSON.parse(await queue.get(key)),
})

await context.executions().checkpoint(task, jobId)                 // JSON-safe, no collaborators
const resumed = context.executions().restore(state, { models: () => context.llm() })
```

### Add a provider

```typescript
import { openAiFamily, registerLlmPlugin } from '@owlmeans/llm'
import { StructuredMode } from '@owlmeans/llm-common'

registerLlmPlugin({
  ...openAiFamily,                       // shares owns/refine/toolChoice/responseFormat
  type: 'my-gateway',
  structuredMode: config => config.structuredOutput === true ? StructuredMode.Native : StructuredMode.Tool,
  build: ({ config, secret, callbacks }) => new ChatOpenAI({ /* … */ }),
})
```

Registration order matters for instance-based lookup (a refined model that lost its config
metadata): the first plugin whose `owns` matches wins, so the conservative member of a
client family must be registered first.

## API

### Model

| Method | Returns | Use for |
|--------|---------|---------|
| `ask(input, options)` | `string` | Plain text. |
| `talk(input, options)` | `AIMessage` | The raw message (tool calls, metadata). |
| `invoke(input, schema, options)` | `T` | A schema-validated object. |
| `request(input, schema, options)` | `AIMessage` | A message whose `content` is the validated JSON. |

Shared options: `action` (run name + spectator label), `ref` (out-of-band result +
spectator entry), `filter` (reject a result and force a retry), `useCache` / `cacheMax`
(prompt caching where the provider supports it), `temperature` (`invoke` only).

### Resilience built into every call

| Problem | What the package does |
|---------|-----------------------|
| Provider accepts the request and never streams | Idle (per-token) deadline aborts and retries — `ModelConfig.streamTimeout` |
| Duplicate final SSE chunk corrupts tool-call arguments | Stream breaks at the first non-empty `finish_reason` |
| Reasoning eats the whole output budget | Retry doubles `maxTokens` toward `maxTokensCap` **and** shrinks an absolute reasoning cap |
| A weak cheap model keeps failing | Escalates to `ModelConfig.fallback` after `FALLBACK_AFTER_ATTEMPTS`, within one plugin family |
| Model stringifies arrays / over-wraps scalars | `coerceToSchema` reconciles the answer with the schema before validation |
| Model ignores the tool and answers in prose | `parseJsonContent` salvages JSON from fences and surrounding text |
| A blank message poisons the request (Anthropic 400 `text content blocks must contain non-whitespace text`, typically an empty file read pasted into a prompt) | Whitespace-only text blocks are dropped before every call; blank tool results are stubbed to keep their `tool_use` pairing, and an all-blank input becomes one stub user message |
| Nothing usable came back | `NullCapture` — request, response, token accounting and finish reason, to the spectator |
| An error no retry can fix | `registerFatalError` / `LlmPlugin.isFatal` abort the loop immediately |

### Helpers (usable alongside a model)

`withRetry` · `registerFatalError` · `spectate` · `normalizeInput` · `parseJsonContent` ·
`coerceToSchema`. Also exported from `@owlmeans/llm/helpers`.

Everything under `src/utils/` is library-private and deliberately not exported.

### Plugins

Exported from `@owlmeans/llm/plugins` as well as the root: `plugins` (the registry),
`registerLlmPlugin`, `resolvePlugin`, `pluginOf`, `pluginFor`, `anthropicPlugin`,
`openAiPlugin`, `compatiblePlugin`, `openAiFamily`.

## Tests

```bash
bun test ./tests
```

Offline specs always run. The live specs in `tests/model.spec.ts` are gated: set
`OPENROUTER_SECRET` (and optionally `OPENROUTER_URL`) and/or `ANTHROPIC_SECRET` in the repo
root `.env`. With none set they self-skip with a printed reason — never a failure.

## Depends On

- `@owlmeans/llm-common` — serializable contracts
- `@owlmeans/context` — service registration
- `@owlmeans/error` — `ResilientError` family
- `@owlmeans/basic-ids` — diagnostic ids
- `ajv` — schema validation
- peer `@langchain/core`, `@langchain/openai`, `@langchain/anthropic`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
