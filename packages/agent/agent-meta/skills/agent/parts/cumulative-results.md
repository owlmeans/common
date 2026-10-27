---
name: cumulative-results
description: Cumulative pipeline results — deterministic extractors, the ledger and its rebuild, how a step's view is cut, refresh, model summaries, composed runs and seeds.
metadata:
  purposes: agent, job
  mentions: cumulativeResultsPlugin, CUMULATIVE_RESULTS_PLUGIN, CumulativeResultStore, CumulativeResultFact, DEFAULT_RESULT_SUMMARY_SCHEMA, ctx.results, withResults
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/agent — Cumulative pipeline results

## Cumulative pipeline results

After each step, code reads what the step produced into FACTS (`CumulativeResultFact`: a type's
shape and import specifier, an endpoint's method/path/guard, a resource's table, a file) and every
later step is told them — so it uses the authoritative names instead of re-deriving them.

```ts
const pipeline = makePipeline<State, Deps>(spec, {
  steps, runs,
  plugins: [cumulativeResultsPlugin<State, Deps>({
    spec: { steps: { types: { extractors: ['ts-types'], full: ['endpoints'] } } }, // or run => spec | null
    extractors: { 'ts-types': { scope: ({ deps }) => deps.glob('src/types/**'), extract: readTypes } },
    store,                                    // CumulativeResultStore; share it with composed pipelines
  })],
})
// inside a step:
const exec = executions().withResults(taskExec, ctx.results?.view)   // every model built from it composes the view
ctx.results?.record({ files: written })                             // what the step touched
ctx.results?.facts({ kind: 'type', name: 'User' })                  // typed query for code
```

- **Extractors are deterministic code, never a model call.** A rebuild after a crash must find
  exactly what the first pass found. `scope` recomputes the files an extractor answers for from
  DURABLE inputs (state keys, the file tree), never from what a step reported — it is what a rebuild
  reads. Declarations name extractors; the plugin holds the code.
- **The ledger is an optimization, never the authority.** A fresh start or restart clears the run's
  own entries (and those of runs composed under it); a continuation loads them and silently
  REBUILDS any missing entry of a finished step from its durable scope. Resume correctness never
  depends on the store; a failing store is a warning. A step's `record({ facts })`-only facts with
  no extractor cannot be rebuilt.
- **A view is cut once per step**: predecessors only (siblings may not have run), full within
  `window` edges (default 2) or when the producer names the step in `full` (`'*'` for every step),
  names only beyond, never shown when named in `omit`. Over `maxChars` the OLDEST entries not naming
  the step go to names only, then out (listed in `view.omitted`); named ones last; an entry's own
  text is never cut. `facts()` answers from every visible entry regardless of the prompt budget.
- **A fact belongs to the first entry that produced it** — the step's predecessors and the runs
  composed under the step itself. A later re-extraction never duplicates it.
- **A later step that rewrites an earlier entry's files refreshes it**: re-extracted from its own
  sources, revision bumped, facts about untouched files kept (`refresh: false` opts out). Entries of
  other pipelines are never refreshed — their extractors live elsewhere.
- **A skipped step** keeps a stored entry, or gets one rebuilt from its files; **a failed optional
  step** gets a `partial` entry from what it left behind.
- **Model summaries are OFF unless a step declares `summary`** and the plugin has `summarize`.
  The request carries a ready prompt and schema; the answer is rendered deterministically, capped
  in code, always labelled "not verified", and a failure is a warning without the summary.
- **A composed run shares its parent's ledger** (parent's, else the root run id); its steps see the
  parent's view for the composing step, and the parent's later steps see the child's entries,
  labelled `<composingStep>/<childStep>` and ordered inside the composing step. Both pipelines must
  be given the SAME store.
- **Seeds** are facts known before any step ran, visible to every step. A declaration resolved to
  `null`/`false` leaves that run without `ctx.results` at all.
