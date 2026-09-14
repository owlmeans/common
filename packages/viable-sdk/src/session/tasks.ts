import type { ModelTask } from '@owlmeans/viable-common'

import { OpQueue } from './queue.js'

/**
 * Model tasks waiting for the parent agent.
 *
 * Everything about how they queue, redeliver and settle is {@link OpQueue}'s; what is left here is
 * the name the rest of the SDK reads them under. A task is a model CALL — the parent runs it in a
 * clean subagent and submits the answer back — which is a different thing from a question, and the
 * two must never drain into one another's tools.
 */
export class TaskQueue extends OpQueue<ModelTask> {
  /** Handed to the parent and still unanswered, oldest first. */
  outstandingTasks(): ModelTask[] {
    return this.outstanding()
  }
}
