import type { ModelTask } from '@owlmeans/viable-common'

import { OpQueue } from './queue.js'

/** When the platform stops waiting for a task; one without a readable time waits behind every other. */
const expiryOf = (task: ModelTask): number => {
  const at = Date.parse(task.expiresAt)

  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at
}

/**
 * Model tasks waiting for the parent agent.
 *
 * Everything about how they queue, redeliver and settle is {@link OpQueue}'s; what is left here is
 * the name the rest of the SDK reads them under. A task is a model CALL — the parent runs it in a
 * clean subagent and submits the answer back — which is a different thing from a question, and the
 * two must never drain into one another's tools.
 */
export class TaskQueue extends OpQueue<ModelTask> {
  /**
   * The task that expires first goes first. The platform gives up on a task at its `expiresAt` —
   * a synchronous check inside a blocked call within seconds, a run's call within minutes — so the
   * one with the least time left is the one a parent must not find behind the others.
   */
  constructor() {
    super((a, b) => expiryOf(a) - expiryOf(b))
  }

  /** Handed to the parent and still unanswered, oldest first. */
  outstandingTasks(): ModelTask[] {
    return this.outstanding()
  }
}
