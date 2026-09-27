import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import {
  AgentRunStateError, DEFAULT_MAX_STATE_CHARS, INQUIRY_ANSWERS_KEY, PipelineNotIdempotentError,
  PipelineNotResumableError, PipelineRunStatus, PipelineSpecError, PipelineStateTooLargeError,
  PipelineVersionError,
  orderPipelineSteps, pipelineDescendants, pipelineStep, validatePipelineSpec,
} from '@owlmeans/agent-common'
import type {
  PipelineProgress, PipelineRun, PipelineRunInquiry, PipelineSpec, PipelineState, PipelineStepSpec,
} from '@owlmeans/agent-common'
import { DEFAULT_INQUIRY_ANSWER_CHARS, capAnswer, stateAnswerOf } from '@owlmeans/llm-common'
import type { InquiryAnswer } from '@owlmeans/llm-common'
import type {
  PipelineInvokeArgs, PipelineModel, PipelineOptions, PipelineResult, PipelineRunContext,
  PipelineStep, PipelineStepMapping,
} from './types.js'

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

/**
 * How many questions ONE composing step may relay for its child before it gives up.
 *
 * A composed pipeline that keeps asking is a pipeline that will never finish, and the parent is the
 * only place with a count to bound it: each round is a fresh child invocation, so nothing else in
 * the stack can see that it is the same step asking again.
 */
const MAX_INQUIRY_ROUNDS = 8

/** The answers a state carries, as a map. Total: a state that has never been asked has none. */
const answersIn = (state: unknown, key: string): Record<string, InquiryAnswer> => {
  const held = (state as Record<string, unknown> | null | undefined)?.[key]

  return typeof held === 'object' && held != null ? held as Record<string, InquiryAnswer> : {}
}

/**
 * The graph builder, seen loosely.
 *
 * `StateGraph`'s node names are a generic parameter that only a literal-typed builder chain can
 * satisfy, and a pipeline's nodes come from data. The precision belongs at THIS package's public
 * boundary — `PipelineSpec`, `PipelineStep`, `PipelineModel` are all exact — not in the three lines
 * that hand LangGraph a name it will look up in a map either way.
 */
interface LooseGraph {
  addNode: (
    name: string,
    fn: (state: unknown) => Promise<Record<string, unknown>>,
    options?: Record<string, unknown>,
  ) => LooseGraph
  addEdge: (start: string | string[], end: string) => LooseGraph
  compile: (options?: { checkpointer?: BaseCheckpointSaver }) => {
    invoke: (input: unknown, config?: Record<string, unknown>) => Promise<unknown>
  }
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
  validatePipelineSpec(spec)

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

  const order = orderPipelineSteps(spec)
  const total = order.length
  const runs = options.runs
  const maxStateChars = options.maxStateChars ?? DEFAULT_MAX_STATE_CHARS
  const answersKey = options.inquiry?.answersKey ?? INQUIRY_ANSWERS_KEY
  const maxAnswerChars = options.inquiry?.maxAnswerChars ?? DEFAULT_INQUIRY_ANSWER_CHARS
  const trace = options.trace ?? (() => undefined)
  const terminals = spec.steps
    .filter(declared => !spec.steps.some(other => (other.after ?? []).includes(declared.step)))
    .map(declared => declared.step)

  /** The copy of an answer this pipeline's STATE is allowed to hold. */
  const forState = (answer: InquiryAnswer): InquiryAnswer =>
    stateAnswerOf(capAnswer(answer, maxAnswerChars))

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
  ): Promise<PipelineResult<S>> => {
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
        console.warn(`Pipeline progress reporter failed for ${spec.alias}:`, e)
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
            const capped = capAnswer({ ...answer, inquiryId: inquiry.id }, maxAnswerChars)
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
                ...answersIn(live, answersKey), [inquiry.id]: stateAnswerOf(capped),
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
            console.warn(`Pipeline ${spec.alias}:${step} could not save the state it parked on:`, e)
          }

          throw new PipelineStopSignal('inquiry')
        },
      }

      return ctx
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
          console.warn(`Pipeline guard for ${spec.alias}:${step} failed, running the step:`, e)
        }

        if (skip) {
          trace(`[pipe:${spec.alias}:${row.runId}] step ${index}/${total} ${step} (skip)`)
          report({ pipeline: spec.alias, runId: row.runId, step, index, total, skipped: true })
          await commit({ completed: step })

          return { completed: [step] }
        }

        trace(`[pipe:${spec.alias}:${row.runId}] step ${index}/${total} ${step} (run)`)
        report({ pipeline: spec.alias, runId: row.runId, step, index, total })

        try {
          const patch = (await handler.run(live as Readonly<S>, ctx)) ?? {}
          Object.assign(live, patch)
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
            console.warn(`Pipeline ${spec.alias}:${step} failed and is optional:`, e)
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

    try {
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
      } else if (outcome.fatal != null) {
        await commit({
          status: PipelineRunStatus.Failed,
          failedAt: outcome.failedAt ?? row.completed[row.completed.length - 1] ?? order[0],
          error: asError(outcome.fatal).message,
          freezeState: true,
        }).catch(saveError => console.error('Pipeline could not record a fatal outcome:', saveError))
        throw outcome.fatal
      } else {
        outcome.error = outcome.error ?? asError(e)
        await commit({
          status: PipelineRunStatus.Failed,
          failedAt: outcome.failedAt ?? '',
          error: outcome.error.message,
          freezeState: true,
        }).catch(saveError => console.error('Pipeline could not record a failure:', saveError))
      }
    } finally {
      args.signal?.removeEventListener('abort', onAbort)
    }

    return {
      runId: row.runId,
      status: row.status,
      state: live,
      completed: [...row.completed],
      pending: [...row.pending],
      warnings: [...row.warnings],
      ...(row.failedAt != null && row.failedAt !== '' ? { failedAt: row.failedAt } : {}),
      ...(outcome.error != null ? { error: outcome.error } : {}),
      ...(row.note != null ? { note: row.note } : {}),
      ...(row.inquiry != null ? { inquiry: row.inquiry } : {}),
    }
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

      return await execute(row, live, seeded, args)
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
        const rerun = pipelineDescendants(spec, args.from)
        const blocked = rerun.filter(step =>
          completed.includes(step) && pipelineStep(spec, step)?.nonIdempotent === true)
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

      return await execute(row, live, new Set(completed), args)
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
