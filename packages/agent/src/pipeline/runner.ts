import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import {
  AgentRunStateError, DEFAULT_MAX_STATE_CHARS, PipelineNotIdempotentError, PipelineRunStatus,
  PipelineSpecError, PipelineStateTooLargeError, PipelineVersionError,
  orderPipelineSteps, pipelineDescendants, pipelineStep, validatePipelineSpec,
} from '@owlmeans/agent-common'
import type {
  PipelineProgress, PipelineRun, PipelineSpec, PipelineState, PipelineStepSpec,
} from '@owlmeans/agent-common'
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
  constructor(public readonly reason: 'budget' | 'signal') {
    super(`pipeline-stop:${reason}`)
    this.name = 'PipelineStopSignal'
  }
}

const isStop = (e: unknown): e is PipelineStopSignal => e instanceof PipelineStopSignal

const asError = (e: unknown): Error => e instanceof Error ? e : new Error(String(e))

const nowIso = (): string => new Date().toISOString()

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
  const trace = options.trace ?? (() => undefined)
  const terminals = spec.steps
    .filter(declared => !spec.steps.some(other => (other.after ?? []).includes(declared.step)))
    .map(declared => declared.step)

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
      stopped: 'budget' | 'signal' | null
    } = { failedAt: null, error: null, fatal: null, stopped: null }

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

    const contextFor = (step: string): PipelineRunContext<S, C> => ({
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
    })

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
        await commit({
          status: PipelineRunStatus.Aborted,
          note: `stopped: ${outcome.stopped ?? 'budget'}`,
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
      const live = {
        ...JSON.parse(existing.state === '' ? '{}' : existing.state),
        ...(args.patch ?? {}),
      } as S

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
        // The child keeps a run row of its own, addressed under the parent's, so a parent resumed
        // at this step resumes the CHILD at the child's own failed step instead of re-running all
        // of it.
        const result = await model.invoke(mapping.input(parent), {
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

        if (result.status === PipelineRunStatus.Failed) {
          if (mapping.tolerate?.(result) === true) {
            ctx.report(`${step}: ${result.failedAt ?? 'failed'} — ${result.error?.message ?? ''}`)

            return mapping.output(result.state, parent)
          }
          throw result.error ?? new Error(`${spec.alias} failed at ${result.failedAt ?? '?'}`)
        }

        return mapping.output(result.state, parent)
      },
    }),
  }

  return model
}
