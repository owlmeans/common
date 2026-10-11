import type { BaseCheckpointSaver } from '@langchain/langgraph'
import type { PipelineProgress, PipelineRun, PipelineRunInquiry, PipelineRunStatus, PipelineSpec, PipelineState } from '@owlmeans/agent-common'
import type { Inquiry, InquiryAnswer } from '@owlmeans/llm-common'
import type { PipelineRunStore } from '../../stores/types.js'
import type { StepResults } from '../results/types.js'

/**
 * What a step is handed while it runs.
 *
 * Everything on it is runtime — none of it is serialized, and `deps` in particular is the bag of
 * collaborators (a file helper, an execution, a service) that make the step able to do anything at
 * all. Keeping them here rather than in the state is the whole reason a pipeline state can stay
 * small enough to write at every step boundary.
 */
export interface PipelineRunContext<S extends PipelineState, C> {
  runId: string
  step: string
  spec: PipelineSpec
  /** Whatever the caller passed to `invoke`/`resume`. NEVER serialized. */
  deps: C
  /** The subject the run belongs to — carried so a composed sub-pipeline inherits it. */
  scope: string
  entityId?: string
  /** Steps already behind this one, including those a resume inherited. */
  completed: readonly string[]
  /** Aborted when the caller's signal aborts, and when the run's budget runs out. */
  signal: AbortSignal
  /**
   * Persist a patch NOW, before the step returns.
   *
   * The unit of replay is a step, so a step that does N undoable things in a loop has to be able to
   * say how many it has done — otherwise a resume repeats them. Every `mark` is a row write, so
   * mark a cursor, never a payload.
   */
  mark: (patch: Partial<S>) => Promise<void>
  /** Progress, not state. Reaches `onProgress` and the run row's `note`; never replayed. */
  report: (note: string) => void
  /**
   * The run's budget is spent.
   *
   * Cooperative: a step that can stop cleanly should finish the unit it is on and return. The
   * runner then ends the run `Aborted` with `pending` naming what is left, and a later resume
   * continues from there.
   */
  expired: () => boolean
  /** What is left of the run's budget, or `undefined` when it has none. */
  remainingMs: () => number | undefined
  /**
   * Put a question to a person and wait for the answer.
   *
   * Three outcomes, in this order. An answer already in the state — which is what a resume carries
   * — comes straight back. A live channel that answers has its answer RECORDED in the state before
   * it is returned, so the same question is never asked twice. Otherwise the run stops `Waiting`
   * with the inquiry on its row and this call never returns: it throws the runner's own stop
   * signal, which is not a failure and must not be caught by the step.
   *
   * What the step reads is the WHOLE answer; only the copy kept in the state is cut, because a
   * state is scalars and keys and an answer's prose belongs wherever the pipeline keeps documents.
   *
   * `Inquiry.id` is the ONLY thing an answer is matched by, so it must be DERIVED from the step and
   * the thing being decided — never minted per call. An id generated afresh on every entry can
   * never match what the state holds, so the run re-asks and parks again forever.
   */
  ask: (inquiry: Inquiry) => Promise<InquiryAnswer>
  /**
   * What the earlier steps produced, cut for this step — present only when a pipeline plugin
   * supplies it (`cumulativeResultsPlugin`). A pipeline that seats no such plugin never has the key.
   *
   * Hand `results.view` to the step's execution (`ExecutionService.withResults`) and every model
   * built from it composes the view; call `results.record` with what the step wrote so the next
   * steps are told about it.
   */
  results?: StepResults
}

/**
 * The composing step of a parent pipeline, as a run composed under it (`asStep`) sees it —
 * read-only by construction: a composed run may learn where it sits, never write its parent.
 */
export interface PipelineParentRef {
  pipeline: string
  runId: string
  step: string
  /** The parent step's results surface, when its pipeline seats a results plugin. */
  results?: StepResults
}

/**
 * How a run entered the runner: a first run, a run carried on from where its row stopped (an
 * `invoke` on an unfinished row, or any `resume`), or an unfinished row discarded on request.
 */
export type PipelineEnterMode = 'fresh' | 'continue' | 'restart'

export interface PipelineEnterEvent<S extends PipelineState, C> {
  spec: PipelineSpec
  runId: string
  scope: string
  entityId?: string
  deps: C
  mode: PipelineEnterMode
  /** Steps this execution inherits as complete, in order. None of them will run or pass. */
  inherited: readonly string[]
  /** The state the run starts from — restored from its row, with the seed or patch merged. */
  state: Readonly<S>
  /** Present when the run is a step of another pipeline. */
  parent?: PipelineParentRef
}

export interface PipelineStepEvent<S extends PipelineState, C> {
  step: string
  ctx: PipelineRunContext<S, C>
  /** The live state. Read it; a plugin never writes it. */
  state: Readonly<S>
}

export interface PipelineAfterStepEvent<S extends PipelineState, C> extends PipelineStepEvent<S, C> {
  /** What the step returned, already merged into `state`. */
  patch: Partial<S>
}

export interface PipelinePassStepEvent<S extends PipelineState, C> extends PipelineStepEvent<S, C> {
  /** `skipped` — its guard answered true; `failed` — it is `optional`, failed, and the run goes on. */
  reason: 'skipped' | 'failed'
  error?: Error
}

export interface PipelineExitEvent<S extends PipelineState, C> {
  spec: PipelineSpec
  runId: string
  deps: C
  result: PipelineResult<S>
}

/** What `beforeStep` may hand the step. The first plugin to offer `results` owns them. */
export interface PipelineStepContribution {
  results?: StepResults
}

/**
 * An optional capability of a pipeline run, seated by `alias` and run by ascending `order`.
 *
 * A plugin WATCHES a run: it never writes the pipeline's state — whatever it keeps, it keeps in a
 * store of its own — and it never decides where a run stands, which the row alone does. Every hook
 * is wrapped: a plugin that throws is logged and the run goes on, because losing an enhancement
 * costs what it adds and never the work. The one exception is an error `PipelineOptions.fatal`
 * calls fatal, which takes the exact path a fatal step error takes — the row written `Failed`
 * first, then the error rethrown.
 *
 * - `enter` — once per `invoke`/`resume`, before the first step, with how the run entered.
 * - `beforeStep` — once the runner has decided the step will RUN, before it runs.
 * - `afterStep` — after the step's patch is merged into the state and BEFORE the row commit that
 *   marks the step complete, so what a plugin persists lands before the step is durably done.
 * - `passStep` — a step skipped by its guard, or an optional step that failed.
 * - `exit` — once, at the end, with the result the caller is about to receive.
 */
export interface PipelinePlugin<S extends PipelineState, C> {
  alias: string
  /** Lower runs first. Defaults to 50. */
  order?: number
  enter?: (event: PipelineEnterEvent<S, C>) => Promise<void> | void
  beforeStep?: (
    event: PipelineStepEvent<S, C>,
  ) => Promise<PipelineStepContribution | void> | PipelineStepContribution | void
  afterStep?: (event: PipelineAfterStepEvent<S, C>) => Promise<void> | void
  passStep?: (event: PipelinePassStepEvent<S, C>) => Promise<void> | void
  exit?: (event: PipelineExitEvent<S, C>) => Promise<void> | void
}

/**
 * How a pipeline puts a question to a person.
 *
 * Absent altogether means no channel at all: a step that asks parks the run at once. That is the
 * safe default — a run given no way to ask must never invent one.
 */
export interface PipelineInquiryOptions<S extends PipelineState, C> {
  /**
   * Answer live, or `null` to say nobody is there — which parks the run.
   *
   * A THROW is not a park: it escapes and fails the step as an ordinary outcome, because an error
   * from the channel says the asking failed, not that the answer is no.
   */
  ask?: (inquiry: Inquiry, ctx: PipelineRunContext<S, C>) => Promise<InquiryAnswer | null>
  /** Where answers live in the state. Defaults to `INQUIRY_ANSWERS_KEY`. */
  answersKey?: string
  /** Ceiling on ONE answer. Defaults to `DEFAULT_INQUIRY_ANSWER_CHARS`. */
  maxAnswerChars?: number
}

export interface PipelineStep<S extends PipelineState, C> {
  step: string
  /**
   * Answered on EVERY entry — a first run, a resume, a replay — and `true` makes the step a no-op.
   *
   * This is what makes a resume correct, and it is deliberately not delegated to the graph engine:
   * a guard reads the durable marker the step itself wrote, so it is right whether or not anything
   * replayed, whether or not a checkpoint survived, and whether or not the step list has since
   * been reordered.
   */
  skipWhen?: (state: Readonly<S>, ctx: PipelineRunContext<S, C>) => Promise<boolean> | boolean
  /** Returns the patch to merge into the state. `void` means "nothing to record". */
  run: (state: Readonly<S>, ctx: PipelineRunContext<S, C>) => Promise<Partial<S> | void>
}

export interface PipelineOptions<S extends PipelineState, C> {
  steps: PipelineStep<S, C>[]
  /** Where the run row lives. Absent ⇒ the run is not resumable and nothing is persisted. */
  runs?: PipelineRunStore
  /**
   * LangGraph's own persistence. Optional by contract: the run row is the authority, so a missing
   * or expired checkpoint costs a replay, never a correct answer.
   */
  checkpointer?: BaseCheckpointSaver
  /**
   * Errors that must escape rather than become a `Failed` result — an exhausted budget, a refusal.
   * The row is written `Failed` first, then the error is rethrown.
   */
  fatal?: (e: unknown) => boolean
  maxStateChars?: number
  /** How `ctx.ask` reaches a person. Absent ⇒ every question parks the run. */
  inquiry?: PipelineInquiryOptions<S, C>
  onProgress?: (progress: PipelineProgress) => void
  /** One line per step boundary. The only place a runner says anything. */
  trace?: (line: string) => void
  /**
   * Optional capabilities of every run — seated by alias, run by ascending `order`. None seated,
   * the runner behaves exactly as if the seam did not exist: no hook is awaited, and a step's
   * context carries no `results`.
   */
  plugins?: PipelinePlugin<S, C>[]
}

export interface PipelineResult<S extends PipelineState> {
  runId: string
  status: PipelineRunStatus
  state: S
  completed: string[]
  pending: string[]
  warnings: string[]
  failedAt?: string
  error?: Error
  note?: string
  /** What a `Waiting` run stopped on. Present only with that status. */
  inquiry?: PipelineRunInquiry
}

export interface PipelineInvokeArgs<C> {
  runId: string
  deps: C
  /** The subject the run belongs to — an application with projects passes the project id. */
  scope: string
  entityId?: string
  /** Recorded so a resume can re-take the same lock. */
  lockTask?: string
  budgetMs?: number
  signal?: AbortSignal
  onProgress?: (progress: PipelineProgress) => void
  /**
   * Discard an unfinished run under this id and start over.
   *
   * Without it, invoking a runId whose row is `Running`, `Failed` or `Aborted` CONTINUES it — which
   * is what makes a handler that is simply called again pick up where it stopped instead of paying
   * for the work twice. A `Done` row always starts a fresh run.
   */
  restart?: boolean
  /**
   * The composing step, when this run is a step of another pipeline. Set by `asStep`; handed to
   * the plugins' `enter`, and never persisted.
   */
  parent?: PipelineParentRef
}

export interface PipelineResumeArgs<C> {
  deps: C
  /** Re-enter this step and everything that waits on it. Defaults to whatever is not complete. */
  from?: string
  /** Required to re-enter a completed `nonIdempotent` step. */
  force?: boolean
  /** Merged into the restored state before the first step runs. */
  patch?: Record<string, unknown>
  /**
   * Answers to questions the run parked on, keyed by inquiry id.
   *
   * MERGED into the state's answers rather than assigned over them, and merged last — after
   * `patch` — so an answer given earlier is never dropped by a resume that carries a newer one.
   */
  answers?: Record<string, InquiryAnswer>
  budgetMs?: number
  signal?: AbortSignal
  onProgress?: (progress: PipelineProgress) => void
}

/**
 * How a pipeline becomes one step of another.
 *
 * The child keeps its own run row (`<parentRunId>/<step>`), so a parent resumed at the composing
 * step resumes the child at the child's own failed step rather than re-running all of it.
 */
export interface PipelineStepMapping<S extends PipelineState, PS extends PipelineState> {
  input: (parent: Readonly<PS>) => Partial<S>
  output: (child: Readonly<S>, parent: Readonly<PS>) => Partial<PS>
  /** Called when the child ends `Failed`. Return `true` to swallow it into the parent's warnings. */
  tolerate?: (result: PipelineResult<S>) => boolean
}

export interface PipelineModel<S extends PipelineState, C> {
  spec: () => PipelineSpec
  invoke: (seed: Partial<S>, args: PipelineInvokeArgs<C>) => Promise<PipelineResult<S>>
  resume: (runId: string, args: PipelineResumeArgs<C>) => Promise<PipelineResult<S>>
  /** The run row as stored. `null` with no store bound, or for an unknown run. */
  snapshot: (runId: string) => Promise<PipelineRun | null>
  asStep: <PS extends PipelineState>(
    step: string, mapping: PipelineStepMapping<S, PS>
  ) => PipelineStep<PS, C>
}
