import type { Inquiry } from '@owlmeans/llm-common'
import type { ResourceRecord } from '@owlmeans/resource'
import { DEFAULT_STEP_ATTEMPTS } from './consts.js'
import { PipelineSpecError, PipelineUnknownStepError } from './errors.js'

/**
 * What a pipeline carries between its steps.
 *
 * Scalars and KEYS — ids, revisions, markers, lists of codes. Never an artifact. Everything large a
 * pipeline produces belongs in a store of its own and travels here as the key that finds it again:
 * the state is serialized into the run row at every step boundary, and a state that carries a
 * document is a row that carries it too, once per step.
 */
export type PipelineState = Record<string, unknown>

export interface PipelineStepSpec {
  step: string
  /**
   * The steps that must have completed before this one may run.
   *
   * Absent or empty means "from the start". Several steps naming the same predecessor fan OUT;
   * one step naming several predecessors JOINS them. That is the whole edge vocabulary — there is
   * no conditional edge, because a branch that is expressed as an edge is invisible to a resume,
   * while a branch expressed as {@link PipelineStep.skipWhen} is the same mechanism that makes a
   * resume correct.
   */
  after?: string[]
  /** Human-readable, for progress reporting and tool descriptions. */
  title?: string
  /** A failure is recorded on the run's `warnings` and the successors still run. */
  optional?: boolean
  /**
   * Re-running repeats a side effect that cannot be undone — a wipe, a purge, a claim against a
   * rate-limited authority, a model call whose output is already on disk.
   *
   * A resume never re-enters one of these on its own; `resume(runId, { from })` refuses without
   * `force`. It is also refused `attempts > 1`, since an automatic retry is exactly the thing the
   * flag says must not happen.
   */
  nonIdempotent?: boolean
  /**
   * Attempts for ONE entry of this step. Default {@link DEFAULT_STEP_ATTEMPTS} = 1.
   *
   * Deliberately not a ladder: retry budgets in this family MULTIPLY (an outer 8 around a model's
   * own inner 8 is 64 real calls), so a step that wants retries asks for them once, here, and the
   * helpers below it keep theirs.
   */
  attempts?: number
  /** Wall clock for one attempt, in milliseconds. */
  timeout?: number
}

export interface PipelineSpec {
  alias: string
  /**
   * Bumped whenever a step is added, removed or renamed.
   *
   * `completed` names steps by string, so a run resumed under a changed spec would skip work it
   * never did — silently, because an unknown name simply matches nothing. A version mismatch is
   * refused instead.
   */
  version: number
  steps: PipelineStepSpec[]
}

/** How a run ended, or that it has not. */
export enum PipelineRunStatus {
  Running = 'running',
  Done = 'done',
  Failed = 'failed',
  /** Stopped on purpose with work left — a budget expired, or the caller asked. Resumable. */
  Aborted = 'aborted',
  /**
   * Stopped on purpose, waiting for an answer to {@link PipelineRun.inquiry}.
   *
   * Resumable, and NOT stale: a waiting run has no process behind it and its `heartbeatAt` will not
   * move again until somebody answers. A reconciler that reads staleness alone would take this for
   * a crashed run and repair what is merely waiting.
   */
  Waiting = 'waiting',
}

/**
 * What a `Waiting` run is waiting for.
 *
 * Written by the runner when a step asks a question nobody could answer while it ran, and read by
 * everything that reports a run — a resume delivers the answer under {@link Inquiry.id}, which is
 * the only thing that routes it back.
 */
export interface PipelineRunInquiry {
  /** The step that asked. A resume re-enters exactly this one. */
  step: string
  askedAt: string
  inquiry: Inquiry
}

/**
 * The data plane of a pipeline run, and the ONE authority on where it stands.
 *
 * Not the LangGraph checkpoint: that is a replay optimization which may legitimately be absent (it
 * is size-guarded and expires), and a design that trusts it has a silent hole exactly where a
 * crashed run needs an answer. Everything that reads a run's position — a resume, a reconciler, an
 * operator, a status endpoint — reads this row.
 *
 * Timestamps are ISO strings, never `Date`: these records cross process boundaries and storage
 * backends. A consumer whose store prefers dates maps them at its own adapter boundary.
 */
export interface PipelineRun extends ResourceRecord {
  /** The business key. Chosen by the caller so a run is addressable before it exists. */
  runId: string
  pipeline: string
  version: number
  /** The subject the run belongs to — for an application with projects, the project id. */
  scope: string
  /** The tenant. Carried so a store can refuse a read that crosses an organization. */
  entityId?: string
  status: PipelineRunStatus
  /** Steps that have finished, in the order they finished. */
  completed: string[]
  /** Steps that had not run when the run stopped. Empty on a `Done` run. */
  pending: string[]
  /** JSON TEXT of {@link PipelineState}. Text, not a subdocument — a state key is a caller's word. */
  state: string
  stateChars: number
  /** What an `optional` step reported when it failed. Never empties a run. */
  warnings: string[]
  failedAt?: string
  error?: string
  /** The last thing a step said about itself. Progress, not state. */
  note?: string
  /**
   * The question this run stopped on.
   *
   * Present only while `status === Waiting`, and cleared on every entry of the run — a row that
   * kept advertising a question it has already been given would have every reader offer it again.
   */
  inquiry?: PipelineRunInquiry
  /** Whatever lock the run held, so a resume can re-take the same one. */
  lockTask?: string
  /** How many times this run has been RESUMED. Reset only by a `Done` outcome. */
  attempts: number
  startedAt: string
  /**
   * Written at every step boundary — the only signal that separates a run still working from one
   * whose process died. A reconciler reads staleness here, never the status.
   */
  heartbeatAt: string
  updatedAt: string
}

/** What the runner reports as it moves. Never persisted as state. */
export interface PipelineProgress {
  pipeline: string
  runId: string
  step: string
  /** 1-based position in the topological order. */
  index: number
  total: number
  skipped?: boolean
  note?: string
}

const fault = (faults: string[], message: string): void => {
  faults.push(message)
}

/**
 * Every fault in one message, or nothing.
 *
 * Total and IO-free, so a spec can be checked by a test in microseconds and by the runner at build
 * time. It reports EVERY fault it finds rather than the first, because a spec is authored once and
 * a build that names one fault per run turns a five-minute edit into five builds.
 */
export const validatePipelineSpec = (spec: PipelineSpec): void => {
  const faults: string[] = []

  if (spec.alias == null || spec.alias.trim() === '') {
    fault(faults, 'alias is empty')
  }
  if (!Number.isInteger(spec.version) || spec.version < 1) {
    fault(faults, `version must be a positive integer, got ${String(spec.version)}`)
  }
  if (!Array.isArray(spec.steps) || spec.steps.length === 0) {
    fault(faults, 'no steps declared')
    throw new PipelineSpecError(`${spec.alias ?? '?'}: ${faults.join('; ')}`)
  }

  const seen = new Set<string>()
  for (const step of spec.steps) {
    if (step.step == null || step.step.trim() === '') {
      fault(faults, 'a step has an empty name')
      continue
    }
    if (seen.has(step.step)) {
      fault(faults, `duplicate step "${step.step}"`)
    }
    seen.add(step.step)
  }

  for (const step of spec.steps) {
    for (const dependency of step.after ?? []) {
      if (dependency === step.step) {
        fault(faults, `step "${step.step}" declares itself in \`after\``)
      } else if (!seen.has(dependency)) {
        fault(faults, `step "${step.step}" waits on unknown step "${dependency}"`)
      }
    }
    const attempts = step.attempts ?? DEFAULT_STEP_ATTEMPTS
    if (!Number.isInteger(attempts) || attempts < 1) {
      fault(faults, `step "${step.step}" declares attempts ${String(step.attempts)}`)
    }
    if (step.nonIdempotent === true && attempts > 1) {
      fault(
        faults,
        `step "${step.step}" is nonIdempotent and declares attempts ${attempts} — an automatic `
        + 'retry is exactly what that flag says must not happen',
      )
    }
    if (step.timeout != null && (!Number.isFinite(step.timeout) || step.timeout <= 0)) {
      fault(faults, `step "${step.step}" declares timeout ${String(step.timeout)}`)
    }
  }

  // A cycle is reported here rather than left to the sort, so one message carries every fault.
  if (faults.every(entry => !entry.includes('unknown step'))) {
    const cycle = detectCycle(spec)
    if (cycle != null) {
      fault(faults, `cycle: ${cycle.join(' → ')}`)
    }
  }

  if (faults.length > 0) {
    throw new PipelineSpecError(`${spec.alias}: ${faults.join('; ')}`)
  }
}

const detectCycle = (spec: PipelineSpec): string[] | null => {
  const after = new Map(spec.steps.map(step => [step.step, step.after ?? []]))
  const state = new Map<string, 0 | 1 | 2>()
  const path: string[] = []

  const walk = (name: string): string[] | null => {
    const mark = state.get(name)
    if (mark === 2) return null
    if (mark === 1) return [...path.slice(path.indexOf(name)), name]

    state.set(name, 1)
    path.push(name)
    for (const dependency of after.get(name) ?? []) {
      const found = walk(dependency)
      if (found != null) return found
    }
    path.pop()
    state.set(name, 2)

    return null
  }

  for (const step of spec.steps) {
    const found = walk(step.step)
    if (found != null) return found.reverse()
  }

  return null
}

/**
 * The steps in an order that respects every `after`, with declaration order as the tie-break.
 *
 * Deterministic on purpose: the order decides what a progress report calls "step 3 of 16" and what
 * a resume considers already behind it, and an order that depends on a `Set`'s iteration would make
 * both drift between processes.
 *
 * @throws {PipelineSpecError} on a cycle or an unknown `after`.
 */
export const orderPipelineSteps = (spec: PipelineSpec): string[] => {
  const names = spec.steps.map(step => step.step)
  const known = new Set(names)
  const pending = new Map<string, Set<string>>()
  const dependents = new Map<string, string[]>()

  for (const step of spec.steps) {
    const dependencies = new Set<string>()
    for (const dependency of step.after ?? []) {
      if (!known.has(dependency)) {
        throw new PipelineSpecError(
          `${spec.alias}: step "${step.step}" waits on unknown step "${dependency}"`,
        )
      }
      dependencies.add(dependency)
      dependents.set(dependency, [...(dependents.get(dependency) ?? []), step.step])
    }
    pending.set(step.step, dependencies)
  }

  const ordered: string[] = []
  const emitted = new Set<string>()

  while (ordered.length < names.length) {
    // Declaration order among everything currently ready — never a set's own order.
    const ready = names.filter(name => !emitted.has(name) && (pending.get(name)?.size ?? 0) === 0)
    if (ready.length === 0) {
      const cycle = detectCycle(spec)
      throw new PipelineSpecError(
        `${spec.alias}: cycle: ${(cycle ?? names.filter(name => !emitted.has(name))).join(' → ')}`,
      )
    }
    for (const name of ready) {
      ordered.push(name)
      emitted.add(name)
      for (const dependent of dependents.get(name) ?? []) {
        pending.get(dependent)?.delete(name)
      }
    }
  }

  return ordered
}

/**
 * `step` and everything that transitively waits on it.
 *
 * What a resume has to re-run when an operator names a step: re-entering a step without re-entering
 * what read its output leaves the run describing a state that no longer follows from itself.
 *
 * @throws {PipelineUnknownStepError} when the spec does not declare `step`.
 */
export const pipelineDescendants = (spec: PipelineSpec, step: string): string[] => {
  if (!spec.steps.some(entry => entry.step === step)) {
    throw new PipelineUnknownStepError(`${spec.alias}:${step}`)
  }

  const reached = new Set<string>([step])
  let grew = true
  while (grew) {
    grew = false
    for (const entry of spec.steps) {
      if (reached.has(entry.step)) continue
      if ((entry.after ?? []).some(dependency => reached.has(dependency))) {
        reached.add(entry.step)
        grew = true
      }
    }
  }

  return orderPipelineSteps(spec).filter(name => reached.has(name))
}

/** The declaration of one step, by name. `null` when the spec does not declare it. */
export const pipelineStep = (spec: PipelineSpec, step: string): PipelineStepSpec | null =>
  spec.steps.find(entry => entry.step === step) ?? null
