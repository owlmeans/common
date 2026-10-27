---
name: pipelines
description: Resumable pipelines over a checkpointed StateGraph — steps and edges, the PipelinePlugin seam, and the rules for run rows, step guards, state size, failures and retries.
metadata:
  purposes: agent, job, state
  mentions: makePipeline, PipelineSpec, PipelinePlugin, asStep, skipWhen, nonIdempotent, makeCheckpointSaver, PipelineRunStore, CheckpointStore, maxStateChars, ctx.mark, ctx.stop, PipelineStopReason, @owlmeans/agent/pipeline
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/agent — Pipelines

## Pipelines

A pipeline is a **state machine over named steps** whose position is persisted at every step
boundary, so a run killed anywhere continues from the step it stopped at rather than from zero.

```ts
const spec: PipelineSpec = {
  alias: 'vib:story:design', version: 1,
  steps: [
    { step: 'screens' },
    { step: 'ux', after: ['screens'] },
    { step: 'data', after: ['screens'] },          // runs BESIDE `ux`
    { step: 'persist', after: ['ux', 'data'] },    // joins BOTH
  ],
}

const pipeline = makePipeline<State, Deps>(spec, { steps, runs, checkpointer, fatal })
await pipeline.invoke(seed, { runId, deps, scope: projectId, stop: person.signal })
await pipeline.resume(runId, { deps, from: 'data' })
```

**`StateGraph`, not the functional API.** A resume must be able to name the step it starts at, and
only a graph has named nodes; `entrypoint`/`task` identifies a task by its positional call ordinal,
which renumbers on any edit to the function — under a file watcher that is the common case, not the
corner case. The functional API stays exactly where it is, inside `makeAgentModel`'s ReAct loop.

**Edges are `after: string[]`.** Several steps naming one predecessor fan out; one step naming
several joins them, and the join waits for ALL of them (the array form of `addEdge`, which is a
barrier — separate single edges would fire on the first). Branching is `skipWhen`, never a
conditional edge: a branch expressed as an edge is invisible to a resume, while a branch expressed
as a guard is the same mechanism that makes a resume correct.

**The graph is compiled per run and the steps close over their dependencies.** Passing collaborators
through the engine's config would make a run depend on which config keys a given LangGraph minor
propagates into a node body. A closure cannot be lost.

## Pipeline plugins

```ts
interface PipelinePlugin<S, C> {
  alias: string; order?: number                     // seated by alias, run by ascending order
  enter?: (event) => void        // once per invoke/resume: mode fresh|continue|restart, inherited steps, parent
  beforeStep?: (event) => { results?: StepResults } | void   // the step WILL run; may hand it ctx.results
  afterStep?: (event) => void    // patch merged into state, BEFORE the row commit marks the step done
  passStep?: (event) => void     // reason: 'skipped' (guard) | 'failed' (optional step, run goes on)
  exit?: (event) => void         // once, with the result the caller is about to receive
}
```

**A plugin watches a run; it never writes the state and never decides where the run stands.**
Whatever it keeps, it keeps in a store of its own. `afterStep` runs before the commit so a plugin's
own write lands before the step is durably done — a crash between the two re-runs the step rather
than leaving a done step with nothing recorded about it.

**A plugin that throws costs a warning, never the run** — unless `options.fatal` calls the error
fatal: then it takes the exact path a fatal step error takes, the row written `Failed` first and the
error rethrown (from `enter`, `passStep` and `exit` too). The runner's stop signal passes through.

**Seating nothing changes nothing.** Every hook site is guarded, so a pipeline without plugins awaits
nothing it did not await before — its parallel steps interleave identically and its step context
has no `results` key. `tests/pipeline-compat.spec.ts` pins this with golden rows, trace lines and
progress events recorded from the runner before the seam existed; it must stay green unedited.

`asStep` passes the composing step to the child as `PipelineInvokeArgs.parent` (read-only:
pipeline, run id, step, and the parent step's `results`); the child's plugins see it on `enter`.
It also hands the child the parent's `signal`, `stop` and what is left of the budget.

## Rules

**The run ROW is the authority on where a run stands — never the LangGraph checkpoint.** The
checkpoint is size-guarded and expires, so a design that reads a run's position out of it has a
silent hole exactly where a crashed run needs an answer. Every reader of a position — a resume, a
reconciler, an operator, a status endpoint — reads the row. With no checkpointer bound at all, a
resume is still correct; the checkpointer buys replay, never correctness.

**Every step is guarded twice.** The runner refuses to re-enter a step its row calls complete, and
the application's `skipWhen` reads a durable marker the step itself wrote. The first covers a clean
crash; the second covers a crash BETWEEN the side effect and the row write, which the first cannot
see. A step that does N undoable things in a loop marks a cursor with `ctx.mark`.

**An inherited step never consults `skipWhen` and never runs.** On a resume every step the row
calls complete is INHERITED: it is reported skipped, its `run` is not called, and neither is its
`skipWhen`. Whatever it kept in memory — a deps cache, a value a later step reads — is absent in a
resumed process. So a step's output that a later step needs lives in a durable artifact, and every
consumer reads the cache, then the artifact, then derives again; a consumer that trusts the cache
iterates nothing after a restart and reports success.

**A step that returns is committed complete — early or not.** The runner commits whatever `run`
returns, and only then stops the run on an expired budget or a stop (`Aborted`). A loop that returns
early on `ctx.expired()` or `ctx.stop` with units left is therefore DONE on the resume, and the units
are never done. Either finish the work or throw; a cursor (`ctx.mark`) makes a crashed loop
resumable, not an early return.

**Three ways to end a run short, and only one is a person's stop.** `PipelineResult.stopped` names
which one ended it (`budget` | `signal` | `stop`, and `inquiry` for a `Waiting` run):

| | What it is | Checked | Row |
|---|---|---|---|
| `budgetMs` | cooperative deadline | after each step commits (`ctx.expired()`) | `Aborted`, `stopped: budget` |
| `signal` | HARD kill, also handed to LangGraph | LangGraph rejects at once | `Failed` (or `Aborted`, `stopped: signal`, when a commit sees it first) |
| `stop` | the person's cooperative stop, never linked to LangGraph | at every node's entry, and after each step commits | `Aborted`, `stopped: stop` |

`signal` is never a person's stop: LangGraph returns at once while the running step carries on
detached and unattended, writing files after the caller moved on and saving its row after the rows
were cleared. `stop` lets the running steps finish and commit; at a node's entry it is RECORDED, not
thrown — every remaining node returns empty and the run ends `Aborted` once the graph drains — and
after a commit it is thrown, like the budget. A later `resume` (or `invoke` of the same run id)
continues from the next step. Steps see it as `ctx.stop` — present only when the caller passed one —
and hand it to the work they start (a nested agent loop, a composed child); a step never returns
early on it.

**A stop thrown after a commit lets LangGraph cancel the steps running beside it.** A parallel
sibling still in its `run` is abandoned by the graph: its body carries on detached, its result is
discarded, and its own commit can still land on the row after the terminal write (the status stays
`Aborted`). A caller that rolls a stopped run back has to tolerate that late write.

**A composed child that ends `Aborted` stops the parent.** `asStep` throws the runner's stop with the
child's reason, so the composing step is NOT committed and the parent ends `Aborted` with the same
`stopped`; a resume re-enters the composing step and the child continues from its own row.
`mapping.output` sees only a `Done` child (or a `Failed` one `tolerate` accepts). Broke when violated:
a child out of budget had its partial state mapped, the composing step was committed complete, and
the child's remaining steps never ran.

**A pipeline state is scalars and KEYS.** Ids, revisions, markers, lists of codes — never an
artifact. The state is serialized into the row at every step boundary, so a field carrying a
document writes one copy of it per step. Over `maxStateChars` the step FAILS: refused, never
truncated, because a resume replaying from a cut-down state replays from a state that never existed.

**A step failure is an OUTCOME, not a throw.** `invoke`/`resume` return
`{ status: Failed, failedAt, error }`, because every caller has a status, a warning or a record to
write before it decides anything, and a throwing runner puts that in a `catch` where it gets
forgotten. The one exception is `options.fatal`: those are written to the row Failed FIRST and then
rethrown, so an exhausted budget cannot become a result a caller carries on from.

**No default retry.** `attempts` defaults to 1, because retry budgets in this family MULTIPLY — an
outer retry around a model's own inner retry is their product. `attempts > 1` on a `nonIdempotent`
step is refused at build time: an automatic retry is exactly what that flag says must not happen.

**`nonIdempotent` marks a step whose side effect cannot be undone** — a wipe, a purge, a claim
against a rate-limited authority, a model call whose output is already on disk. `resume({ from })`
refuses to re-enter a completed one without `force`.

**A ReAct run is not a resumable unit, and that is why `makeAgentModel` still builds its
`entrypoint` inside `invoke()`.** Its state is an unbounded message list whose tool results are side
effects already applied to the world: re-entering a turn re-applies them. What IS resumable is a
pipeline — and an agent run belongs inside one of its steps.
