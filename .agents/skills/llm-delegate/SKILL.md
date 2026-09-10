---
name: llm-delegate
description: How to use @owlmeans/llm-delegate — the ModelProvider.Delegated runtime, a BaseChatModel whose calls are performed outside the process by a transport seated in a registry — the four plugin hooks, why one chunk means a long streamTimeout, why a Json answer comes back as a pinned tool call, and why DelegateUnavailable is fatal. Auto-invoked when seating a delegate transport, building a delegated model config, or debugging a run whose model calls are performed by somebody else.
user-invocable: false
---

# @owlmeans/llm-delegate

**Layer:** Cross-cutting domain
**Install:** `"@owlmeans/llm-delegate": "^0.1.18-rc.1"` in `dependencies` (peer `@langchain/core`)
**Contracts:** `@owlmeans/llm-common` (`./delegate`) — `DelegatedTask`, `DelegatedResult`,
`DelegateTransport`, `DelegatedMode`/`Role`/`ResultKind`; the provider value is
`ModelProvider.Delegated`

A chat model that talks to no provider. It packages the call — system prompt, conversation, tools or
schema — and hands it to a transport the application seated, which carries it to something outside
this process entirely: a coding agent driving the application through a connector, a person, a test.
The answer comes back the same way and becomes a completion the rest of the stack cannot tell apart
from a provider's. It exists so that "who performs this call" is a property of the **session**
rather than of the code: same pipeline, same prompts, same retry rules, billed to somebody else.

## Key Exports

| Export | Description |
|--------|-------------|
| `DelegatedChatModel` | The `BaseChatModel`. Fields: `delegate`, `tier`, `role`, `attempt`, `feedback`, `maxOutputChars`; `withAttempt(n, feedback?)` |
| `delegatedPlugin` | The `LlmPlugin`, self-registered on import |
| `registerDelegateTransport(key, transport)` · `releaseDelegateTransport(key)` · `hasDelegateTransport(key)` · `transportFor(key)` | The registry. `transportFor` throws rather than waits |
| `DelegateError` · `DelegateUnavailable` | `ResilientError` classes, both registered |
| `DELEGATED_SECRET` | `'delegated'` — the placeholder credential |
| `DELEGATED_MODEL_PREFIX` | `'delegated:'`; a config's `model` is `delegated:<tier>` |
| `DELEGATED_TIMEOUT_MS` | 45 min — the ceiling one delegated call may take |
| `DELEGATED_LLM_TYPE` | What langchain is told this model is |

## The seam is one method, and everything about waiting belongs to whoever implements it

```typescript
interface DelegateTransport {
  dispatch: (task: DelegatedTask, signal?: AbortSignal) => Promise<DelegatedResult>
}
```

Transports are seated in a module-level registry **by key**, exactly like the provider-plugin
registry beside it: one process holds many at once — one per connected agent — and a
`ModelConfig.delegate` names the one its run belongs to. Seat on attach, release when the performer
goes away; a call arriving afterwards fails immediately rather than hanging on a transport nobody
is behind.

**A transport that cannot serve a call must THROW, never answer with an error result.** An error
result is a bad answer, which is retried; a transport that is gone is terminal.

## `DelegateUnavailable` is fatal, and that is the whole reason it is its own class

Every retry in the stack exists for a model that answered badly; none of them helps when there is
nobody to ask. Left unrecognised, an absent performer costs the full ladder — the caller's, the
model's, and the escalator's product of the two — before anything says what was actually wrong.
`delegatedPlugin.isFatal` returns it, and `isFatalError` (`@owlmeans/llm`) is what a loop ABOVE the
model asks so it does not climb to a stronger model against a performer that is not there.

## Four hooks carry the design

| Hook | What it answers for a call with no endpoint |
|---|---|
| `build` | Construct the model from `config.delegate` and `delegated:<tier>` |
| `family: 'delegated'` | Its own family, so the escalator never swaps a delegated model for a real one — a cross-family fallback changes the structured-output shape mid-run, and here it would also change who is billed |
| `refine` | Rebuild for a retry keeping the **same performer**, raising only `attempt` (and feedback) |
| `structuredMode: Tool` | Structured output is a pinned tool call — the same mechanism the tool-calling providers use |

`refine` cannot usefully change anything else: there is no output budget to raise (the performer's
own model has its own) and no endpoint to move to. What the attempt number buys is a performer that
can see it is being asked again, and why its previous answer was refused.
`suppressesThinking: () => true` keeps the runtime from appending a `/no_think` directive that would
just be text in somebody else's prompt — a performer is a whole agent with its own settings.

## One chunk comes back, so a delegated config MUST declare a long `streamTimeout`

The performer answers once, so `_streamResponseChunks` yields a single chunk (and `_generate` folds
that same call). The runtime's deadline measures **silence between tokens**, and there is exactly
one silence here — the whole call. A delegated config that inherits the default 3-minute idle
deadline is a config whose every call is aborted and retried from scratch.

`DELEGATED_TIMEOUT_MS` (45 minutes) is the model's own ceiling, sized for what a performer actually
is: a subagent on a large refactor, a rate-limited provider, somebody who walked away mid-turn. It
exists so a dead performer eventually fails the call rather than holding a run open forever — not to
pace a working one. A transport with its own deadline is free to be stricter.

## A `Json` answer is turned back into a pinned TOOL CALL

`invoke`/`request` pin one tool and read the structured result **off the call**, so an answer
delivered as text would be a shape the caller never asked for. The mode a task is asked in follows
the same fact: no tools is `Text`, a pinned `tool_choice` is `Json` (and carries that tool's schema
as `outputSchema`, because a performer told "answer with one JSON object" produces something a
person can also read), an open tool set is `Tools`.

The completion chunk carries both `tool_calls` and `tool_call_chunks` — `concat` merges the CHUNK
form, and without it a single-chunk stream loses its calls the moment anything accumulates it.

**An answer of nothing is left empty on purpose.** The runtime's own null-result reporting is what
turns that into a diagnosis, and a stand-in value here would hide it.

## What crosses the wire, and what deliberately does not

Content is flattened to text and the system message is lifted out of the conversation: a performer
is a coding agent or a person, and multi-part content, provider cache markers and image blocks mean
nothing to either — a shape they cannot read is a shape they will silently drop. `toToolChoice`
reduces every provider's spelling (`{type:'tool',name}`, `{type:'function',function:{name}}`) to a
name, because a performer has no provider. No pipeline vocabulary travels: a `role` and a `tier`
only, because the performer has to choose a model. Usage the performer reports is carried for the
trace and costs this deployment nothing.

## `DELEGATED_SECRET` is a placeholder, not a credential

The model factory refuses a config with no `secret`, because for every other provider that means a
deployment forgot one. A delegated model authenticates nothing, so it carries a value that is
visibly not a secret rather than earning a special case in the factory. A delegated `ModelConfig`
therefore reads: `provider: Delegated`, `secret: DELEGATED_SECRET`, `delegate: <registry key>`,
`model: 'delegated:<tier>'`, a long `streamTimeout`, and output caps that only give the runtime's own
clamps something sane to work with.

## Tests

`bun test ./tests` — offline throughout, with a seated test transport recording what the performer
was asked and answering what the test says.

## Depends On

- `@owlmeans/llm` (the plugin registry, `LlmPlugin`) · `@owlmeans/llm-common` · `@owlmeans/error` ·
  `@owlmeans/basic-ids` · peer `@langchain/core`

## Related

- [[llm]] — the runtime the model plugs into, the retry ladder and `isFatalError`
- [[llm-common]] — the serializable contracts, including `./delegate`
- [[viable-sdk]] — the connector that performs delegated calls on a coding agent's side
