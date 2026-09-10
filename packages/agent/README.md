# @owlmeans/agent

Context-aware LLM agents and pipelines over the LangGraph functional API, with pluggable memory and
storage-independent persistence.

Contracts live in [`@owlmeans/agent-common`](../agent-common); LangGraph and LangChain core are
**peer** dependencies.

## Building an agent

```ts
import { makeAgentModel } from '@owlmeans/agent'

const agent = makeAgentModel({
  exec,                      // an @owlmeans/llm Execution — its prompt policy is the persona
  tools,                     // { [name]: StructuredToolInterface }
  context: [projectBrief],   // volatile context; lands in PromptBlock.Context
})

const result = await agent.invoke('rename the dashboard header')
```

Or through the context service, which pre-attaches the plugins registered on it:

```ts
import { appendAgentsService } from '@owlmeans/agent'

appendAgentsService(context, { conversations, plugins: [summarizePlugin({ store })] })
const agent = context.agents().agent({ exec, tools })
```

## Plugins

`AgentPlugin` is the optional-capability seam: a plugin may contribute what the agent knows
(`context`), what it can do (`tools`), watch it work (`onTurn`), and act when it stops (`onFinish`).

| Plugin | What it adds |
|---|---|
| `summarizePlugin` | Compacts each finished run into `summary` + `advice`, and replays the last few on the way in |
| `memoryGraphPlugin` | Durable notes filed by subsystem, with links — index injected, content pulled by tool |
| `memoryEventsPlugin` | A bounded, ordered record of what happened |

Both memory plugins also export a plain API (`memoryGraph`, `memoryEvents`) usable with no agent at
all, so a pipeline helper writes to the same store an agent reads.

## Things worth knowing before you change it

**Contributed context goes to `PromptBlock.Context` and nowhere else.** That is the only block a
provider will not put a cache breakpoint on. Volatile material anywhere above it invalidates the
prefix that every call sharing a persona pays for.

**`safeInvokeTool` must never throw.** A rejected LangGraph task aborts the whole superstep: every
sibling tool call in the same parallel batch dies with it, discarding work they had already
finished. A tool failure comes back as `{ error }` the model can read and correct.

**Resolution is by `tool.name`, not by map key.** `bindTools` advertises the tool's own name, so a
map keyed by a local variable silently loses any tool whose two names drifted apart — advertised,
callable, and permanently "not found".

**`autoFinish: false` when something runs after the agent.** A compaction written before a
validation or build pass describes a state that did not survive it, so its "what to do next" is
advice about a world that no longer exists. Call `result.run.finish(outcome)` once the real outcome
is known; it is idempotent.

**Plugin failures never fail a run.** Contributing, per-turn work and finalization are all
swallowed with a warning. Memory is an enhancement; losing it costs context, throwing costs the work.

**Ports, not resources.** `ConversationStore` and friends are narrow interfaces a consumer
implements. An unbound port is not an error — the plugin that needs it becomes a no-op.

**Give the compaction call a `runName` your application filters.** Every model call carrying a
purpose is streamed to the client, so without it the summary of a run types itself out in the
user's view of that run, right after it finished.

**No LangGraph checkpointer.** Recoverability lives in the OwlMeans execution and flow layers, which
already own a serializable state model; `makeAgentExecutionPlugin` is the first real implementation
of `@owlmeans/llm`'s `ExecutionPlugin` seam.

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
