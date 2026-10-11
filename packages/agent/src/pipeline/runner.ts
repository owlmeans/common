import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { AgentRunStateError, DEFAULT_MAX_STATE_CHARS, INQUIRY_ANSWERS_KEY, PipelineNotIdempotentError, PipelineNotResumableError, PipelineRunStatus, PipelineSpecError, PipelineStateTooLargeError, PipelineVersionError, type PipelineProgress, type PipelineRun, type PipelineRunInquiry, type PipelineSpec, type PipelineState, type PipelineStepSpec, makePipelineSpecModel } from '@owlmeans/agent-common'
import { DEFAULT_INQUIRY_ANSWER_CHARS, type InquiryAnswer, inquiryHelper } from '@owlmeans/llm-common'
import { logger } from '@owlmeans/log'
import type {
  PipelineEnterMode, PipelineInvokeArgs, PipelineModel, PipelineOptions, PipelineParentRef,
  PipelinePlugin, PipelineResult, PipelineRunContext, PipelineStep, PipelineStepContribution,
  PipelineStepMapping,
} from './runner/types.js'
import type { StepResults } from './results/types.js'
import { DEFAULT_PIPELINE_PLUGIN_ORDER, MAX_INQUIRY_ROUNDS } from './consts.local.js'
import type { LooseGraph } from './runner/types.local.js'

const log = logger('agent:pipeline')

/**
 * Plugins seated by alias — a second registration replaces the first in its place — and ordered
 * by `order`, then by where each alias was first seated.
 */
const seatPlugins = <S extends PipelineState, C>(
  plugins: readonly PipelinePlugin<S, C>[],
): PipelinePlugin<S, C>[] => {
  const seats = new Map<string, { plugin: PipelinePlugin<S, C>, index: number }>()
  plugins.forEach((plugin, index) => {
    seats.set(plugin.alias, { plugin, index: seats.get(plugin.alias)?.index ?? index })
  })

  return [...seats.values()]
    .sort((a, b) =>
      (a.plugin.order ?? DEFAULT_PIPELINE_PLUGIN_ORDER) - (b.plugin.order ?? DEFAULT_PIPELINE_PLUGIN_ORDER)
      || a.index - b.index)
    .map(seat => seat.plugin)
}

/**
 * Ends a run on purpose, with work left to do.
 *
 * Thrown after a step has completed and committed, so it never reads as that step failing — it is
 * how a cooperative budget stops the graph without inventing a failure.
 */
class PipelineStopSignal extends Error {
  constructor(public readonly reason: 'budget' | 'signal' | 'inquiry') {
    super(`pipeline-stop:${reason}`)
    this.name = 'PipelineStopSignal'
  }
}

const isStop = (e: unknown): e is PipelineStopSignal => e instanceof PipelineStopSignal

const asError = (e: unknown): Error => e instanceof Error ? e : new Error(String(e))

const nowIso = (): string => new Date().toISOString()

/** The answers a state carries, as a map. Total: a state that has never been asked has none. */
const answersIn = (state: unknown, key: string): Record<string, InquiryAnswer> => {
  const held = (state as Record<string, unknown> | null | undefined)?.[key]

  return typeof held === 'object' && held != null ? held as Record<string, InquiryAnswer> : {}
}

/**
 * A resumable state machine over LangGraph.
 *
 * Three properties decide everything else about this runner, and each one closes a hole that a more
 * obvious design leaves open:
 *
 * 1. **The run ROW is the authority on where a run stands**, not the LangGraph checkpoint. The
 *    checkpoint is size-guarded and expires; a design that reads a run's position out of it has a
 *    silent hole exactly where a crashed run needs an answer. The checkpointer stays optional and
 *    buys replay, never correctness.
 * 2. **Every step is guarded twice** — by the runner (a step in `completed` is not re-entered) and
 *    by the application (`skipWhen` reads a durable marker the step itself wrote). The first covers
 *    a clean crash; the second covers a crash BETWEEN the side effect and the row write, which the
 *    first cannot see.
 * 3. **The graph is compiled per run and the steps close over their dependencies.** Passing
 *    collaborators through the engine's config would make the run depend on which config keys a
 *    given LangGraph minor propagates into a node body; a closure cannot be lost.
 */
export const makePipeline = <S extends PipelineState, C>(
  spec: PipelineSpec, options: PipelineOptions<S, C>,
): PipelineModel<S, C> => {
  const specModel = makePipelineSpecModel(spec)
  specModel.validate()

  const handlers = new Map<string, PipelineStep<S, C>>()
  const faults: string[] = []
  for (const handler of options.steps) {
    if (handlers.has(handler.step)) {
      faults.push(`two handlers for step "${handler.step}"`)
    }
    handlers.set(handler.step, handler)
    if (!spec.steps.some(declared => declared.step === handler.step)) {
      faults.push(`handler for undeclared step "${handler.step}"`)
    }
  }
  for (const declared of spec.steps) {
    if (!handlers.has(declared.step)) {
      faults.push(`declared step "${declared.step}" has no handler`)
    }
  }
  if (faults.length > 0) {
    throw new PipelineSpecError(`${spec.alias}: ${faults.join('; ')}`)
  }

  const order = specModel.orderSteps()
  const total = order.length
  const runs = options.runs
  const maxStateChars = options.maxStateChars ?? DEFAULT_MAX_STATE_CHARS
  const answersKey = options.inquiry?.answersKey ?? INQUIRY_ANSWERS_KEY
  const maxAnswerChars = options.inquiry?.maxAnswerChars ?? DEFAULT_INQUIRY_ANSWER_CHARS
  const trace = options.trace ?? (() => undefined)
  const terminals = spec.steps
    .filter(declared => !spec.steps.some(other => (other.after ?? []).includes(declared.step)))
    .map(declared => declared.step)
  const seated = seatPlugins(options.plugins ?? [])
  // Tested at every hook site, so a pipeline that seats nothing awaits nothing it did not await
  // before the seam existed — not even a no-op — and its parallel steps interleave exactly as they did.
  const hooked = seated.length > 0

  /**
   * One hook of every seated plugin, in order, collecting what each returned.
   *
   * A plugin that throws is logged and skipped: it is an enhancement, and losing one costs what it
   * adds, never the work. Two things escape — the runner's own stop signal, and an error the
   * pipeline calls fatal. The caller of this function routes the second down the fatal path.
   */
  const eachPlugin = async <T>(
    hook: string, call: (plugin: PipelinePlugin<S, C>) => T | void | Promise<T | void>,
  ): Promise<T[]> => {
    const answers: T[] = []
    for (const plugin of seated) {
      try {
        const answer = await call(plugin)
        if (answer != null) {
          answers.push(answer)
        }
      } catch (e) {
        if (isStop(e) || options.fatal?.(e) === true) {
          throw e
        }
        log.warn('Pipeline plugin failed', { plugin: plugin.alias, hook, alias: spec.alias, error: e })
      }
    }

    return answers
  }

  /** The copy of an answer this pipeline's STATE is allowed to hold. */
  const forState = (answer: InquiryAnswer): InquiryAnswer =>
    inquiryHelper.stateAnswerOf(inquiryHelper.capAnswer(answer, maxAnswerChars))

  /**
   * Fold every source of answers into the live state, later sources winning per id.
   *
   * Writes nothing when there is nothing to write, so a pipeline that never asks a question keeps
   * a state byte-identical to the one it had before this existed.
   *
   * Every folded answer is cut to what a state may hold, exactly as `ctx.ask` cuts a live one. A
   * resume is the PRIMARY way an answer reaches a parked run — that is what `Waiting` exists for —
   * so a ceiling enforced on the live path alone is a ceiling enforced where the least text
   * arrives, and the keys-only state it protects fills up through the other door.
   */
  const mergeAnswers = (live: S, ...sources: Record<string, InquiryAnswer>[]): void => {
    const merged = Object.assign({}, ...sources) as Record<string, InquiryAnswer>
    const ids = Object.keys(merged)
    if (ids.length > 0) {
      (live as Record<string, unknown>)[answersKey] = Object.fromEntries(
        ids.map(id => [id, forState(merged[id])]),
      ) as Record<string, InquiryAnswer>
    }
  }

  /** One execution of the graph over a row that is already decided. */
  const execute = async (
    row: PipelineRun,
    live: S,
    seeded: Set<string>,
    args: {
      deps: C
      budgetMs?: number
      signal?: AbortSignal
      onProgress?: (progress: PipelineProgress) => void
    },
    entry: { mode: PipelineEnterMode, parent?: PipelineParentRef },
  ): Promise<PipelineResult<S>> => {
    const startedAt = Date.now()
    const deadline = args.budgetMs != null ? Date.now() + args.budgetMs : undefined
    const controller = new AbortController()
    const onAbort = (): void => controller.abort()
    args.signal?.addEventListener('abort', onAbort)

    /**
     * What the run has learned about its own ending, as ONE mutable record.
     *
     * A set of `let`s would read better and be wrong: every one of them is written inside a node
     * closure and read after an `await`, which is exactly the shape TypeScript's control-flow
     * analysis narrows away — it sees the initial `null`, cannot see the assignment, and types the
     * later read as `never`.
     */
    const outcome: {
      failedAt: string | null
      error: Error | null
      fatal: unknown
      stopped: 'budget' | 'signal' | 'inquiry' | null
      inquiry: PipelineRunInquiry | null
    } = { failedAt: null, error: null, fatal: null, stopped: null, inquiry: null }

    // A row entering the graph again is a row that is no longer waiting: whatever it asked has
    // either been answered into the state or is about to be asked afresh. Left standing, the
    // question would be offered by every reader of the row for the rest of the run's life.
    row.inquiry = undefined

    const report = (progress: PipelineProgress): void => {
      try {
        options.onProgress?.(progress)
        args.onProgress?.(progress)
      } catch (e) {
        // Progress is narration. A consumer that throws must not take the work with it.
        log.warn('Pipeline progress reporter failed', { alias: spec.alias, error: e })
      }
    }

    const commit = async (patch: {
      completed?: string
      warning?: string
      note?: string
      status?: PipelineRunStatus
      failedAt?: string
      error?: string
      /**
       * Write the row without re-serializing the state.
       *
       * Only the TERMINAL writes use it, and only because of what they are for: if the state is
       * what failed the step, re-serializing it on the way to recording that failure fails the
       * recording too, and the run ends with no row saying why.
       */
      freezeState?: boolean
    } = {}): Promise<void> => {
      if (patch.completed != null && !row.completed.includes(patch.completed)) {
        row.completed = [...row.completed, patch.completed]
      }
      if (patch.warning != null) {
        row.warnings = [...row.warnings, patch.warning]
      }
      if (patch.note != null) {
        row.note = patch.note
      }
      if (patch.status != null) {
        row.status = patch.status
      }
      if (patch.failedAt != null) {
        row.failedAt = patch.failedAt
      }
      if (patch.error != null) {
        row.error = patch.error
      }

      if (patch.freezeState === true) {
        row.pending = order.filter(step => !row.completed.includes(step))
        row.heartbeatAt = nowIso()
        row.updatedAt = row.heartbeatAt
        await runs?.save(row)

        return
      }

      const serialized = JSON.stringify(live)
      if (serialized.length > maxStateChars) {
        // Refused, never truncated. A pipeline state is scalars and keys by contract; a state that
        // overflows is an artifact that belongs in a store of its own, and writing a cut-down copy
        // would let a resume replay from a state that never existed.
        throw new PipelineStateTooLargeError(
          `${spec.alias}:${row.runId}:${serialized.length}>${maxStateChars}`,
        )
      }
      row.state = serialized
      row.stateChars = serialized.length
      row.pending = order.filter(step => !row.completed.includes(step))
      row.heartbeatAt = nowIso()
      row.updatedAt = row.heartbeatAt

      await runs?.save(row)
      trace(
        `[pipe:${spec.alias}:${row.runId}] row saved · completed=${row.completed.length}`
        + `/${total} chars=${row.stateChars}`,
      )
      log.debug('Pipeline row saved', {
        alias: spec.alias, runId: row.runId, completed: row.completed.length, steps: total, chars: row.stateChars,
      })
    }

    const contextFor = (step: string): PipelineRunContext<S, C> => {
      const ctx: PipelineRunContext<S, C> = {
        runId: row.runId,
        step,
        spec,
        deps: args.deps,
        scope: row.scope,
        entityId: row.entityId,
        completed: row.completed,
        signal: controller.signal,
        mark: async patch => {
          Object.assign(live, patch)
          await commit()
        },
        report: note => {
          row.note = note
          report({ pipeline: spec.alias, runId: row.runId, step, index: order.indexOf(step) + 1, total, note })
        },
        expired: () => (deadline != null && Date.now() >= deadline) || controller.signal.aborted,
        remainingMs: () => deadline != null ? Math.max(0, deadline - Date.now()) : undefined,

        ask: async inquiry => {
          const answers = answersIn(live, answersKey)
          const known = answers[inquiry.id]
          if (known != null) {
            // A resume, or a second step asking the same thing. Never a second question.
            return known
          }

          const answer = options.inquiry?.ask != null
            ? await options.inquiry.ask(inquiry, ctx)
            : null

          if (answer != null) {
            const capped = inquiryHelper.capAnswer({ ...answer, inquiryId: inquiry.id }, maxAnswerChars)
            // The state keeps the DECISION and a short excerpt of any prose; the step is handed the
            // whole answer. A state is scalars and keys, and two long answers would spend a
            // pipeline's whole state budget on text nothing replays from.
            //
            // The map is re-read HERE rather than reused from before the await: answers are the one
            // accumulating state key, and steps with no edge between them run in the same superstep.
            // Two of them asking would each write back the copy they read before their channel
            // answered, and the second write would drop the first answer — leaving a question the
            // person has already answered to be asked again on the next entry.
            await ctx.mark({
              [answersKey]: {
                ...answersIn(live, answersKey), [inquiry.id]: inquiryHelper.stateAnswerOf(capped),
              },
            } as Partial<S>)

            return capped
          }

          if (runs == null) {
            // Nothing would be there to resume, so parking would strand the run rather than pause
            // it. The step fails at once and says why.
            throw new PipelineNotResumableError(`${spec.alias}:${row.runId}:no-run-store`)
          }

          // Decided BEFORE the write: a state that has outgrown its cap fails `commit`, and an
          // outcome recorded afterwards would let that failure read as the step's, ending the run
          // `Failed` with a row that says nothing about the question.
          outcome.stopped = 'inquiry'
          outcome.inquiry = { step, askedAt: nowIso(), inquiry }
          row.inquiry = outcome.inquiry
          try {
            await commit()
          } catch (e) {
            // The terminal write freezes the state instead of re-serializing it, so the run still
            // parks with its question on the row.
            log.warn('Pipeline could not save the state it parked on', { alias: spec.alias, step, error: e })
          }

          throw new PipelineStopSignal('inquiry')
        },
      }

      return ctx
    }

    /**
     * `passStep` of every plugin. Called where no step body is running — a guard skip, an optional
     * failure already caught — so a fatal plugin error is routed down the fatal path HERE, exactly
     * as the step's own catch would route a fatal step error.
     */
    const passing = async (
      step: string, ctx: PipelineRunContext<S, C>, reason: 'skipped' | 'failed', error?: Error,
    ): Promise<void> => {
      try {
        await eachPlugin('passStep', plugin => plugin.passStep?.({
          step, ctx, state: live as Readonly<S>, reason, ...(error != null ? { error } : {}),
        }))
      } catch (e) {
        if (!isStop(e)) {
          outcome.fatal = e
          outcome.failedAt = step
        }
        throw e
      }
    }

    const nodeFor = (declared: PipelineStepSpec) =>
      async (): Promise<Record<string, unknown>> => {
        const step = declared.step
        const index = order.indexOf(step) + 1
        const handler = handlers.get(step)!

        if (outcome.stopped != null) {
          // A sibling branch already ended the run; do not start more work.
          return {}
        }

        // Guard one: this execution inherited the step as complete. Independent of anything the
        // engine decides to replay, which is what makes a resume correct with no checkpointer.
        if (seeded.has(step)) {
          trace(`[pipe:${spec.alias}:${row.runId}] step ${index}/${total} ${step} (inherited)`)
          log.debug('Pipeline step inherited', { alias: spec.alias, runId: row.runId, step, index, steps: total })
          report({ pipeline: spec.alias, runId: row.runId, step, index, total, skipped: true })

          return { completed: [step] }
        }

        const ctx = contextFor(step)

        // Guard two: the application's own durable marker. It catches the case guard one cannot —
        // a crash BETWEEN the side effect and the row write, where the step really ran and the row
        // never learned of it.
        let skip = false
        try {
          skip = handler.skipWhen != null ? await handler.skipWhen(live as Readonly<S>, ctx) : false
        } catch (e) {
          if (declared.nonIdempotent === true) {
            // A guard that cannot answer is not permission to repeat an undoable effect.
            outcome.failedAt = step
            outcome.error = asError(e)
            throw e
          }
          log.warn('Pipeline guard failed, running the step', { alias: spec.alias, step, error: e })
        }

        if (skip) {
          trace(`[pipe:${spec.alias}:${row.runId}] step ${index}/${total} ${step} (skip)`)
          log.debug('Pipeline step skipped', { alias: spec.alias, runId: row.runId, step, index, steps: total })
          report({ pipeline: spec.alias, runId: row.runId, step, index, total, skipped: true })
          if (hooked) {
            await passing(step, ctx, 'skipped')
          }
          await commit({ completed: step })

          return { completed: [step] }
        }

        trace(`[pipe:${spec.alias}:${row.runId}] step ${index}/${total} ${step} (run)`)
        log.debug('Pipeline step started', { alias: spec.alias, runId: row.runId, step, index, steps: total })
        report({ pipeline: spec.alias, runId: row.runId, step, index, total })

        try {
          if (hooked) {
            const offered = await eachPlugin<PipelineStepContribution>('beforeStep', plugin => plugin.beforeStep?.({
              step, ctx, state: live as Readonly<S>,
            }))
            const results = offered.find(contribution => contribution.results != null)?.results
            if (results != null) {
              // Only ever set when a plugin offers it: a step of a pipeline that seats none must
              // not even see the key.
              (ctx as { results?: StepResults }).results = results
            }
          }
          const patch = (await handler.run(live as Readonly<S>, ctx)) ?? {}
          Object.assign(live, patch)
          if (hooked) {
            // Before the commit that marks the step complete, so whatever a plugin persists about
            // the step lands before the step is durably done — a crash between the two leaves the
            // step to be run again, never a done step with nothing recorded about it.
            await eachPlugin('afterStep', plugin => plugin.afterStep?.({
              step, ctx, state: live as Readonly<S>, patch: patch as Partial<S>,
            }))
          }
          await commit({ completed: step })
          if (outcome.failedAt === step) {
            // A retry that succeeded. Nothing failed here after all.
            outcome.failedAt = null
            outcome.error = null
          }

          if (ctx.expired()) {
            outcome.stopped = controller.signal.aborted ? 'signal' : 'budget'
            throw new PipelineStopSignal(outcome.stopped)
          }

          return { state: patch as Record<string, unknown>, completed: [step] }
        } catch (e) {
          if (isStop(e)) {
            throw e
          }
          if (options.fatal?.(e) === true) {
            // Written Failed FIRST, then rethrown: a caller that never receives a result cannot
            // record where the run stopped, and a run that vanishes is one nobody can resume.
            outcome.fatal = e
            outcome.failedAt = step
            throw e
          }
          if (declared.optional === true) {
            const warning = `${step}: ${asError(e).message}`
            log.warn('Pipeline optional step failed', { alias: spec.alias, runId: row.runId, step, error: e })
            if (hooked) {
              await passing(step, ctx, 'failed', asError(e))
            }
            await commit({ completed: step, warning })

            return { completed: [step], warnings: [warning] }
          }
          outcome.failedAt = step
          outcome.error = asError(e)
          throw e
        }
      }

    const annotation = Annotation.Root({
      state: Annotation<Record<string, unknown>>({
        reducer: (left, right) => ({ ...left, ...right }),
        default: () => ({}),
      }),
      completed: Annotation<string[]>({
        reducer: (left, right) => [...left, ...right.filter(step => !left.includes(step))],
        default: () => [],
      }),
      warnings: Annotation<string[]>({
        reducer: (left, right) => [...left, ...right],
        default: () => [],
      }),
    })

    const graph = new StateGraph(annotation) as unknown as LooseGraph
    for (const declared of spec.steps) {
      const attempts = declared.attempts ?? 1
      graph.addNode(declared.step, nodeFor(declared), {
        ...(attempts > 1 ? { retryPolicy: { maxAttempts: attempts } } : {}),
        ...(declared.timeout != null ? { timeout: declared.timeout } : {}),
      })
    }
    for (const declared of spec.steps) {
      const after = declared.after ?? []
      if (after.length === 0) {
        graph.addEdge(START, declared.step)
      } else if (after.length === 1) {
        graph.addEdge(after[0], declared.step)
      } else {
        // The ARRAY form is a barrier: the step waits for every predecessor. Separate single edges
        // would let it run as soon as the first one finished.
        graph.addEdge(after, declared.step)
      }
    }
    for (const step of terminals) {
      graph.addEdge(step, END)
    }

    const compiled = graph.compile(
      options.checkpointer != null ? { checkpointer: options.checkpointer } : undefined,
    )

    const resultOf = (error: Error | null = outcome.error): PipelineResult<S> => ({
      runId: row.runId,
      status: row.status,
      state: live,
      completed: [...row.completed],
      pending: [...row.pending],
      warnings: [...row.warnings],
      ...(row.failedAt != null && row.failedAt !== '' ? { failedAt: row.failedAt } : {}),
      ...(error != null ? { error } : {}),
      ...(row.note != null ? { note: row.note } : {}),
      ...(row.inquiry != null ? { inquiry: row.inquiry } : {}),
    })

    /**
     * `exit` of every plugin, with the result the caller is about to receive. On a run already
     * leaving with a fatal error nothing more may escape; otherwise a fatal plugin error takes the
     * fatal path — the row written `Failed` first, then the error rethrown.
     */
    const exiting = async (result: PipelineResult<S>, escaping: boolean): Promise<void> => {
      try {
        await eachPlugin('exit', plugin => plugin.exit?.({
          spec, runId: row.runId, deps: args.deps, result,
        }))
      } catch (e) {
        if (escaping) {
          log.warn('Pipeline plugin failed on exit', { alias: spec.alias, runId: row.runId, error: e })
          return
        }
        await commit({
          status: PipelineRunStatus.Failed,
          failedAt: row.completed[row.completed.length - 1] ?? order[0],
          error: asError(e).message,
          freezeState: true,
        }).catch(saveError => log.error('Pipeline could not record a fatal outcome', saveError))
        throw e
      }
    }

    try {
      if (hooked) {
        try {
          await eachPlugin('enter', plugin => plugin.enter?.({
            spec,
            runId: row.runId,
            scope: row.scope,
            ...(row.entityId != null ? { entityId: row.entityId } : {}),
            deps: args.deps,
            mode: entry.mode,
            inherited: order.filter(step => seeded.has(step)),
            state: live as Readonly<S>,
            ...(entry.parent != null ? { parent: entry.parent } : {}),
          }))
        } catch (e) {
          // Only a fatal error or a stop gets here; a fatal one is recorded the way a step's is.
          if (!isStop(e)) {
            outcome.fatal = e
          }
          throw e
        }
      }
      await compiled.invoke(
        { state: { ...live }, completed: [...row.completed], warnings: [...row.warnings] },
        {
          // A thread per run, so a checkpointer that IS bound has somewhere to put its replay.
          configurable: { thread_id: `${spec.alias}:${row.runId}` },
          recursionLimit: Math.max(total * 4, 64),
          signal: controller.signal,
        },
      )
      if (outcome.stopped == null) {
        await commit({ status: PipelineRunStatus.Done })
        log.info('Pipeline completed', {
          alias: spec.alias, runId: row.runId, ms: Date.now() - startedAt, completed: row.completed.length, steps: total,
        }, { event: 'job.complete' })
      }
    } catch (e) {
      if (isStop(e) || outcome.stopped != null) {
        const waiting = outcome.stopped === 'inquiry'
        await commit({
          status: waiting ? PipelineRunStatus.Waiting : PipelineRunStatus.Aborted,
          note: waiting
            ? `waiting: ${outcome.inquiry?.inquiry.id ?? '?'}`
            : `stopped: ${outcome.stopped ?? 'budget'}`,
          freezeState: true,
        })
        log.info('Pipeline stopped', {
          alias: spec.alias, runId: row.runId, reason: outcome.stopped ?? 'budget', ms: Date.now() - startedAt,
          completed: row.completed.length, steps: total,
        }, { event: 'job.stop' })
      } else if (outcome.fatal != null) {
        await commit({
          status: PipelineRunStatus.Failed,
          failedAt: outcome.failedAt ?? row.completed[row.completed.length - 1] ?? order[0],
          error: asError(outcome.fatal).message,
          freezeState: true,
        }).catch(saveError => log.error('Pipeline could not record a fatal outcome', saveError))
        log.error('Pipeline failed', {
          alias: spec.alias, runId: row.runId, step: row.failedAt, ms: Date.now() - startedAt,
          completed: row.completed.length, message: asError(outcome.fatal).message, error: asError(outcome.fatal),
        }, { event: 'job.fail' })
        if (hooked) {
          await exiting(resultOf(asError(outcome.fatal)), true)
        }
        throw outcome.fatal
      } else {
        outcome.error = outcome.error ?? asError(e)
        await commit({
          status: PipelineRunStatus.Failed,
          failedAt: outcome.failedAt ?? '',
          error: outcome.error.message,
          freezeState: true,
        }).catch(saveError => log.error('Pipeline could not record a failure', saveError))
        log.warn('Pipeline failed', {
          alias: spec.alias, runId: row.runId, step: outcome.failedAt ?? '', ms: Date.now() - startedAt,
          completed: row.completed.length, message: outcome.error.message, error: outcome.error,
        }, { event: 'job.fail' })
      }
    } finally {
      args.signal?.removeEventListener('abort', onAbort)
    }

    const result = resultOf()
    if (hooked) {
      await exiting(result, false)
    }

    return result
  }

  const freshRow = (args: PipelineInvokeArgs<C>): PipelineRun => ({
    runId: args.runId,
    pipeline: spec.alias,
    version: spec.version,
    scope: args.scope,
    ...(args.entityId != null ? { entityId: args.entityId } : {}),
    status: PipelineRunStatus.Running,
    completed: [],
    pending: [...order],
    state: '{}',
    stateChars: 2,
    warnings: [],
    ...(args.lockTask != null ? { lockTask: args.lockTask } : {}),
    attempts: 0,
    startedAt: nowIso(),
    heartbeatAt: nowIso(),
    updatedAt: nowIso(),
  })

  const model: PipelineModel<S, C> = {
    spec: () => spec,

    invoke: async (seed, args) => {
      const existing = args.restart === true ? null : (await runs?.load(args.runId)) ?? null

      // An unfinished row under the same id CONTINUES. That is what makes a handler simply being
      // called again pick up where it stopped instead of paying for the work twice; a caller that
      // means "start over" says so.
      const resuming = existing != null && existing.status !== PipelineRunStatus.Done
      if (resuming && existing.version !== spec.version) {
        throw new PipelineVersionError(
          `${args.runId}: run is version ${existing.version}, spec is ${spec.version}`,
        )
      }

      const row: PipelineRun = resuming
        ? {
          ...existing,
          scope: args.scope,
          ...(args.entityId != null ? { entityId: args.entityId } : {}),
          ...(args.lockTask != null ? { lockTask: args.lockTask } : {}),
          status: PipelineRunStatus.Running,
          attempts: existing.attempts + 1,
          failedAt: undefined,
          error: undefined,
        }
        : freshRow(args)

      const restored = resuming ? JSON.parse(existing.state === '' ? '{}' : existing.state) : {}
      const live = { ...restored, ...seed } as S
      // The seed overwrites the restored state key by key, which is right for every key but this
      // one: answers are cumulative, and a seed carrying the caller's map — or carrying nothing —
      // would drop what the run has already been told and ask the same question again.
      mergeAnswers(live, answersIn(restored, answersKey), answersIn(seed, answersKey))
      const seeded = new Set(resuming ? existing.completed : [])

      trace(
        `[pipe:${spec.alias}:${row.runId}] ${resuming ? 'continue' : 'start'}`
        + ` · steps=${total} inherited=${seeded.size} attempt=${row.attempts}`,
      )
      log.info(resuming ? 'Pipeline continued' : 'Pipeline started', {
        alias: spec.alias, runId: row.runId, steps: total, inherited: seeded.size, attempt: row.attempts,
      }, { event: resuming ? 'job.continue' : 'job.start' })

      return await execute(row, live, seeded, args, {
        mode: args.restart === true ? 'restart' : resuming ? 'continue' : 'fresh',
        ...(args.parent != null ? { parent: args.parent } : {}),
      })
    },

    resume: async (runId, args) => {
      const existing = (await runs?.load(runId)) ?? null
      if (existing == null) {
        throw new AgentRunStateError(`unknown-run:${runId}`)
      }
      if (existing.pipeline !== spec.alias) {
        throw new PipelineVersionError(
          `${runId}: run belongs to "${existing.pipeline}", not "${spec.alias}"`,
        )
      }
      if (existing.version !== spec.version) {
        throw new PipelineVersionError(
          `${runId}: run is version ${existing.version}, spec is ${spec.version}`,
        )
      }

      let completed = [...existing.completed]
      if (args.from != null) {
        const rerun = specModel.descendants(args.from)
        const blocked = rerun.filter(step =>
          completed.includes(step) && specModel.stepOf(step)?.nonIdempotent === true)
        if (blocked.length > 0 && args.force !== true) {
          throw new PipelineNotIdempotentError(`${runId}:${blocked.join(',')}`)
        }
        completed = completed.filter(step => !rerun.includes(step))
      }

      const row: PipelineRun = {
        ...existing,
        status: PipelineRunStatus.Running,
        completed,
        attempts: existing.attempts + 1,
        failedAt: undefined,
        error: undefined,
      }
      const restored = JSON.parse(existing.state === '' ? '{}' : existing.state)
      const live = { ...restored, ...(args.patch ?? {}) } as S
      // Answers merge, and the ones this resume carries land last: a resume is how an answer
      // reaches a parked run, and it must never cost the run the answers it already had.
      mergeAnswers(
        live,
        answersIn(restored, answersKey),
        answersIn(args.patch, answersKey),
        args.answers ?? {},
      )

      trace(
        `[pipe:${spec.alias}:${runId}] resume`
        + `${args.from != null ? ` from=${args.from}` : ''} inherited=${completed.length}/${total}`
        + ` attempt=${row.attempts}`,
      )
      log.info('Pipeline resumed', {
        alias: spec.alias, runId, steps: total, inherited: completed.length, attempt: row.attempts,
        ...(args.from != null ? { from: args.from } : {}),
      }, { event: 'job.resume' })

      return await execute(row, live, new Set(completed), args, { mode: 'continue' })
    },

    snapshot: async runId => (await runs?.load(runId)) ?? null,

    asStep: <PS extends PipelineState>(step: string, mapping: PipelineStepMapping<S, PS>) => ({
      step,
      run: async (parent: Readonly<PS>, ctx: PipelineRunContext<PS, C>) => {
        // What the parent has already been told. Both pipelines default to the same state key, so
        // an answer the parent holds spares the child the round trip of asking for it again.
        const answers: Record<string, InquiryAnswer> = { ...answersIn(parent, answersKey) }

        for (let round = 0; round < MAX_INQUIRY_ROUNDS; ++round) {
          const seed: Record<string, unknown> = { ...mapping.input(parent) }
          if (Object.keys(answers).length > 0) {
            seed[answersKey] = answers
          }

          // The child keeps a run row of its own, addressed under the parent's, so a parent resumed
          // at this step resumes the CHILD at the child's own failed step instead of re-running all
          // of it.
          const result = await model.invoke(seed as Partial<S>, {
            runId: `${ctx.runId}/${step}`,
            deps: ctx.deps,
            scope: ctx.scope,
            ...(ctx.entityId != null ? { entityId: ctx.entityId } : {}),
            ...(() => {
              const remaining = ctx.remainingMs()
              return remaining != null ? { budgetMs: remaining } : {}
            })(),
            signal: ctx.signal,
            // Where the child sits, for its plugins: a results ledger shared with the parent, and
            // the parent's view for this step as what the child's first step starts from.
            parent: {
              pipeline: ctx.spec.alias,
              runId: ctx.runId,
              step,
              ...(ctx.results != null ? { results: ctx.results } : {}),
            },
          })

          if (result.status === PipelineRunStatus.Waiting) {
            if (result.inquiry == null) {
              // A parked run always names what it parked on; without it there is nothing to relay
              // and nothing a resume of the parent could deliver.
              throw new PipelineNotResumableError(
                `${spec.alias}:${ctx.runId}/${step}:waiting-without-inquiry`,
              )
            }
            // Either the parent can answer — from its own state or through a live channel — and the
            // child is re-entered with the answer, or the parent parks on the SAME question, which
            // leaves here as the runner's stop signal rather than as a failure.
            answers[result.inquiry.inquiry.id] = await ctx.ask(result.inquiry.inquiry)
            continue
          }

          if (result.status === PipelineRunStatus.Failed) {
            if (mapping.tolerate?.(result) === true) {
              ctx.report(`${step}: ${result.failedAt ?? 'failed'} — ${result.error?.message ?? ''}`)

              return mapping.output(result.state, parent)
            }
            throw result.error ?? new Error(`${spec.alias} failed at ${result.failedAt ?? '?'}`)
          }

          return mapping.output(result.state, parent)
        }

        // A child that keeps asking is a child that will never finish, and the parent is the only
        // place holding a count: every round is a fresh invocation, so nothing below can see that
        // it is the same step asking again.
        throw new PipelineNotResumableError(
          `${spec.alias}:${ctx.runId}/${step}:questions-exceeded:${MAX_INQUIRY_ROUNDS}`,
        )
      },
    }),
  }

  return model
}
