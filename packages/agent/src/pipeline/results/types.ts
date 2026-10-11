import type { CumulativeResultEntry, CumulativeResultFact, PipelineSpec, PipelineState, ResultFactQuery, ResultViewMode, CumulativeResultsSpec, ResultSummarySpec } from '@owlmeans/agent-common'
import type { CumulativeResults } from '@owlmeans/llm-common'
import type { CumulativeResultStore } from '../../stores/types.js'
import type { PipelineEnterMode, PipelineParentRef } from '../runner/types.js'

/** What a step tells the results plugin about itself. Every call adds to the last. */
export interface ResultRecordInput {
  /** Files the step wrote or rewrote, relative to the project root. */
  files?: string[]
  /** Facts the step already knows. Taken as they are, ahead of anything an extractor finds. */
  facts?: CumulativeResultFact[]
}

/** One entry a step can see, and how its view shows it. */
export interface VisibleResultEntry {
  entry: CumulativeResultEntry
  mode: ResultViewMode
  /** Left out of the prompt for BUDGET — named in `view.omitted` — rather than by declaration. */
  dropped?: boolean
}

/**
 * The results surface of ONE step: the view to put in its prompt, a query over the facts behind
 * that view for code that wants them, and the way to report what the step produced.
 */
export interface StepResults {
  /** The ledger the step's entries belong to. */
  ledger: string
  /** Where the step sits in the ledger — the order key a run composed under it extends. */
  order: readonly number[]
  /** Serializable and frozen; `ExecutionService.withResults(exec, results.view)`. */
  view: CumulativeResults
  /** Every entry visible to the step, oldest first, with how the view shows it. */
  entries: () => readonly VisibleResultEntry[]
  /**
   * Facts visible to the step, narrowed by kind, name and producing step — including those the
   * PROMPT left out for space or by declaration: a budget is about what a model reads, and code
   * asking for a fact is not a model reading a prompt.
   */
  facts: (query?: ResultFactQuery) => CumulativeResultFact[]
  /** Report files touched and facts known. Read once, when the step finishes. */
  record: (input: ResultRecordInput) => void
}

/** What a declaration resolver, a seed and a ledger resolver are told about the run. */
export interface ResultsRunInfo<S extends PipelineState, C> {
  pipeline: string
  spec: PipelineSpec
  runId: string
  scope: string
  entityId?: string
  deps: C
  state: Readonly<S>
  mode: PipelineEnterMode
  parent?: PipelineParentRef
}

/** What an extractor reads facts from. */
export interface ResultExtractInput<S extends PipelineState, C> {
  pipeline: string
  runId: string
  step: string
  /** Durable: the run's state, restored from its row on a resume. */
  state: Readonly<S>
  deps: C
  /** Every file the entry answers for — its durable scope and whatever its step recorded. */
  files: readonly string[]
  /** What was recorded as touched on THIS pass — empty on a rebuild. */
  changed: readonly string[]
}

export interface ResultScopeInput<S extends PipelineState, C> extends Omit<
  ResultExtractInput<S, C>, 'files' | 'changed'
> {}

/**
 * Facts from files. DETERMINISTIC — the same inputs give the same facts — and never a model
 * call: an extractor is what makes a fact a fact, and a rebuild after a crash must find exactly
 * what the first pass found.
 */
export interface ResultExtractFn<S extends PipelineState, C> { (input: ResultExtractInput<S, C>): Promise<CumulativeResultFact[]> | CumulativeResultFact[] }

export interface ResultExtractorSpec<S extends PipelineState, C> {
  /**
   * The files this extractor answers for, recomputed from DURABLE inputs — the state's keys, the
   * file tree — and never from what a step happened to report. It is what a rebuild reads when
   * nothing was recorded, so a step's facts can be found again after the process that ran it died.
   */
  scope?: (input: ResultScopeInput<S, C>) => Promise<string[]> | string[]
  extract: ResultExtractFn<S, C>
}

// Kept as a type: a union of the bare function and the spec form.
export type ResultExtractor<S extends PipelineState, C> =
  ResultExtractFn<S, C> | ResultExtractorSpec<S, C>

/** Facts known before any step of the run ran. Called on every entry of the run; deterministic. */
export interface ResultSeed<S extends PipelineState, C> { (run: ResultsRunInfo<S, C>): Promise<CumulativeResultFact[]> | CumulativeResultFact[] }

/** Everything a summarize callback needs, including a ready prompt. */
export interface ResultSummaryRequest<S extends PipelineState, C> extends ResultSummarySpec {
  schema: Record<string, unknown>
  maxChars: number
  pipeline: string
  runId: string
  step: string
  label: string
  facts: readonly CumulativeResultFact[]
  files: readonly string[]
  state: Readonly<S>
  deps: C
  signal: AbortSignal
  /** The instructions, the step's facts and its files, as one deterministic prompt. */
  prompt: string
}

/**
 * Ask a model for a step's summary; return its schema-shaped answer.
 *
 * Typically `request => model.invoke(request.prompt, request.schema, { action })` on a model
 * resolved for `request.role`. A throw is a warning and the entry goes without a summary.
 */
export interface ResultSummarizer<S extends PipelineState, C> { (request: ResultSummaryRequest<S, C>): Promise<unknown> }

export interface CumulativeResultsPluginOptions<S extends PipelineState, C> {
  alias?: string
  order?: number
  /**
   * The declaration, or a function of the run that returns one — or `null`/`false` to leave THIS
   * run without results. Resolved once, on `enter`.
   */
  spec:
    | CumulativeResultsSpec
    | ((run: ResultsRunInfo<S, C>) =>
      CumulativeResultsSpec | null | false | undefined
      | Promise<CumulativeResultsSpec | null | false | undefined>)
  /** Named deterministic extractors, referenced by name from `StepResultsSpec.extractors`. */
  extractors?: Record<string, ResultExtractor<S, C>>
  /** Named facts available before any step ran. Visible to every step, in name order. */
  seeds?: Record<string, ResultSeed<S, C>>
  /**
   * Where entries live. A composed pipeline must be given the SAME store as the pipeline it is a
   * step of, or neither sees what the other produced. Default: an in-process memory store of this
   * plugin instance.
   */
  store?: CumulativeResultStore
  /** Called only for a step whose declaration has a `summary`. */
  summarize?: ResultSummarizer<S, C>
  /** The ledger a run's entries belong to. Default: the parent's, else the root run's id. */
  ledger?: (run: ResultsRunInfo<S, C>) => string
  trace?: (line: string) => void
}
