---
name: execution
description: The execution service — frozen project, task and helper executions, model resolution precedence, the results view, the utility tier and the advise-only plugin seam.
metadata:
  purposes: agent, state
  mentions: makeExecutionService, appendExecutionService, ExecutionService, withResults, forTask, forHelper, escalate, UTILITY_ROLE, utilityRole, ExecutionPlugin, executionPolicyHelper, collaboratorKeys
---

# @owlmeans/llm — Executions

## Execution: policy in, model out

`ProjectExecution` (policy + purpose + models resolver) → `TaskExecution` (+ resumable state:
phase/cursor/completed/data) → `HelperExecution` (+ a RESOLVED model + `temperatureFactory`, a role).

`prompt` (role, skills, `focus`, `cacheTtl`) travels on `ExecutionState`, so it survives snapshot/restore; `prompts` and
`files` are collaborators and never enter a snapshot. Every method returns a NEW `Object.freeze`d
object. Resolution precedence in `model(exec, role, override)`: **roleOverride → modelOverride →
effort tier → `LlmService.getModel`**; `escalate(exec, { effort })` raises the tier once and cascades
to everything derived from it. `snapshot` excludes `state` itself — without that, every
`derive`/`escalate`/`withPurpose` on a task would nest another copy of the previous state.

### The results view: `withResults(exec, view)`

`ExecutionState.results` carries what the earlier steps of the pipeline an execution works inside
produced (`CumulativeResults`, cut by `@owlmeans/agent`'s `cumulativeResultsPlugin`). A step hands
its own view in with `withResults(exec, ctx.results?.view)`: a new frozen execution, the view
deep-frozen, REPLACING any view already carried — one cut for another step names the wrong
predecessors — and `null`/`undefined` drops the key entirely, so the execution and its snapshots are
what they would be had it never carried one. Inheritance is the ordinary spread down
`forTask`/`forHelper`, and `makeLlmModel` takes `results` from its options, so a consumer that builds
its model from the helper execution itself (`makeLlmModel(exec, spectator)`) composes the view with
no other change. Without a `prompts` resolver, like `prompt`, it is ignored.

Extending it for a domain: declare your own `Execution`/input types, list collaborator fields in
`ExecutionServiceOptions.collaboratorKeys` (kept out of snapshots), instantiate the service generic
with your own `ExecutionShape`, and **never narrow an inherited method signature** (contravariance).

`forHelper` also accepts `output` — an initial `maxTokens` for a helper whose one answer is genuinely
large (a whole source file, not a decision). It is a model selector, not a field the helper carries:
it becomes a call override, clamped to `maxOutput`, doubling under retry, surviving `temperatureFactory`.

### The cheap tier: `utility(exec, override?)`

Work that is not the work — a relevance pick, a classification, a one-line judgement a plugin needs
before the real call can be shaped — runs on `ExecutionService.utility`, never on the helper's own
model. It resolves `policy.utilityRole ?? UTILITY_ROLE` (`@owlmeans/llm-common`, value `'utility'`)
at `ExecutionEffort.Economy`, through the SAME ladder as `model()`: `roleOverrides` remap it and
`modelOverrides` pin it as for any other role. The economy floor is local — the execution it was
asked on keeps its own tier — and `utilityRole` travels on `ModelPolicy`, so it survives
`forTask`/`escalate` and a snapshot/restore round trip. `utility` returns a `BaseChatModel`, never
`undefined`: an alias with no registered config reaches `createModel` through `model()` and throws
`LlmMissconfiguredError`, like any other unregistered role. The `undefined` a prompt plugin has to
handle comes from the other end — `PromptComposeParams.utility` (and `AgentOptions.utility`) is an
OPTIONAL resolver, unset wherever no cheap tier is wired, so a plugin that cannot get one degrades
rather than fails.

### The plugin seam is `advise`-only, and `use()` seats by alias

`ExecutionPlugin` carries one hook: `advise` — answer a performer's question about the project it
works in (`ExecutionService.advise(exec, request)`, first usable answer wins, a throwing plugin is
skipped, `null` when nobody answers). Advice is advisory by contract: a caller appends whatever
comes back and proceeds unchanged on `null`.

**There is no checkpoint pair here, and that is a decision rather than a gap.** An execution is a
COLLABORATOR — a model policy, a purpose, a file helper — rebuilt per run from durable inputs, not
an artifact something restores. Resumability belongs to `@owlmeans/agent`'s pipeline runner, where
the persisted run ROW is the authority on where a run stands. Two half-truths about that would be
worse than one; `ExecutionService.checkpoint` and `ExecutionPlugin.onCheckpoint|onRestore` were
deleted for exactly that reason, having never been implemented by anything.
`TaskExecutionState.{phase, completed, cursor}` survive as **labels** for traces and prompts — a
human-readable "where am I" for a model to read, never a position anything resumes from.

`use(plugin)` seats **by alias**, replacing a plugin already registered under the same one. Mixins
compose, and a layer wired twice would otherwise answer twice — silently, since the first usable
answer wins.
