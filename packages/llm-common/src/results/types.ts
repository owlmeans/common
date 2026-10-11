/**
 * One producing step's contribution to a {@link CumulativeResults} view, already rendered.
 *
 * `step` names the step that produced it — for a step of a pipeline composed under another, the
 * composing path as well (`design/screens`) — so two pipelines' steps of the same name never read
 * as one.
 */
export interface CumulativeResultsSection {
  step: string
  text: string
}

/**
 * What the earlier steps of a pipeline produced, cut for ONE later step.
 *
 * Serializable and immutable: it travels on `ExecutionState.results`, so it survives a snapshot and
 * a restore, and a resumed run composes the same prompt the interrupted one did. Everything in it is
 * already rendered — the view is cut by the pipeline runtime, where the budgets are known, and the
 * prompt layer only places it.
 */
export interface CumulativeResults {
  /** The step this view was cut for. */
  step: string
  /** Oldest first. Each is one producing step, rendered in full or as names only. */
  sections: CumulativeResultsSection[]
  /** Steps whose results exist but were left out of this view to stay inside its budget. */
  omitted: string[]
  /** Characters of the sections as rendered, separators included. */
  chars: number
  /**
   * A digest of the sections — for a trace line or a debugger, to tell two views apart.
   *
   * NEVER rendered into a prompt: it is exactly the kind of varying, meaningless byte a model would
   * copy into its answer or treat as an instruction.
   */
  digest: string
}
