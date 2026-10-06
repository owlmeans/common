import type { PipelineSpec, PipelineStepSpec } from '../../types.js'

/** One step a step transitively waits on, with the fewest `after` edges between the two. */
export interface PipelineStepDepth {
  step: string
  depth: number
}

/** The rules of one pipeline declaration: its validity, its order and the graph of its steps. */
export interface PipelineSpecModel {
  readonly record: PipelineSpec
  /**
   * Every fault in one message, or nothing.
   *
   * Total and IO-free, so a spec can be checked by a test in microseconds and by the runner at build
   * time. It reports EVERY fault it finds rather than the first, because a spec is authored once and
   * a build that names one fault per run turns a five-minute edit into five builds.
   *
   * @throws {PipelineSpecError}
   */
  validate: () => void
  /**
   * The steps in an order that respects every `after`, with declaration order as the tie-break.
   *
   * Deterministic on purpose: the order decides what a progress report calls "step 3 of 16" and what
   * a resume considers already behind it, and an order that depends on a `Set`'s iteration would make
   * both drift between processes.
   *
   * @throws {PipelineSpecError} on a cycle or an unknown `after`.
   */
  orderSteps: () => string[]
  /**
   * `step` and everything that transitively waits on it.
   *
   * What a resume has to re-run when an operator names a step: re-entering a step without re-entering
   * what read its output leaves the run describing a state that no longer follows from itself.
   *
   * @throws {PipelineUnknownStepError} when the spec does not declare `step`.
   */
  descendants: (step: string) => string[]
  /**
   * Every step `step` transitively waits on, with its DEPTH — the fewest `after` edges between the
   * two — in topological order.
   *
   * The mirror of {@link PipelineSpecModel.descendants}, with one deliberate asymmetry: the named step
   * itself is NOT included. A re-run re-enters the step it names, so the descendants include it;
   * nothing is its own predecessor, so the ancestors do not. The depth is what a consumer uses to
   * decide how much of a predecessor's output it needs to be told — a direct predecessor is depth 1
   * however far apart the two sit in the topological order.
   *
   * @throws {PipelineUnknownStepError} when the spec does not declare `step`.
   */
  ancestry: (step: string) => PipelineStepDepth[]
  /** The names from {@link PipelineSpecModel.ancestry}: what must finish before `step` may start, in order. */
  ancestors: (step: string) => string[]
  /** The declaration of one step, by name. `null` when the spec does not declare it. */
  stepOf: (step: string) => PipelineStepSpec | null
}
