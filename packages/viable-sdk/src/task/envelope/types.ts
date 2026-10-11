import type { ModelTask } from '@owlmeans/viable-common'
import type { EnvelopeOptions, ParsedTaskResult } from '../types.js'

/** One model task handed to a parent agent, and the answer it sends back checked against it. */
export interface TaskEnvelopeModel {
  readonly task: ModelTask
  /**
   * What `next_task` hands the parent agent.
   *
   * Text rather than a structure, because the reader is a language model working from a tool result:
   * it has to be able to act on this without a schema in front of it. Everything it must do is
   * stated in order — how to run it, what to call afterwards, what shape the answer takes — before
   * the material itself, so a model that stops reading early has still read the instruction.
   *
   * The task id appears at the top and in the follow-up call on purpose. It is the only thing that
   * routes an answer back, and a parent that paraphrases the rest but copies the id still works.
   */
  renderTaskEnvelope: (opts: EnvelopeOptions) => string
  /**
   * Check a parent's answer against what the task asked for, before the platform ever sees it.
   *
   * The refusal is worth more than the parse. A malformed answer that reaches the platform costs a
   * whole retry — another task, another subagent, another wait — while one caught here is a sentence
   * the parent can act on immediately, with the subagent's context still open. So a failure comes
   * back as a `problem`, not as a thrown error, and the caller renders it as a tool error the model
   * reads and corrects.
   */
  parseTaskResult: (raw: unknown) => ParsedTaskResult
}
