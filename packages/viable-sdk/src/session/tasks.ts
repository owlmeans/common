import type { ModelTask } from '@owlmeans/viable-common'

interface Waiting {
  resolve: (task: ModelTask | null) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Model tasks waiting for the parent agent.
 *
 * A queue rather than a callback because of who drains it: the parent agent asks for work when it
 * is ready, through a tool call, and may take minutes to answer. Nothing here pushes — the whole
 * point of the local-LLM mode is that the platform waits on somebody else's schedule.
 *
 * The operation id is kept beside each task and never shown to the parent. It is what an answer is
 * routed back on, and a parent that could name one could answer an operation it was never given.
 */
export class TaskQueue {
  private readonly queue: ModelTask[] = []
  private readonly ops = new Map<string, string>()
  /**
   * Every task this session has ever been handed.
   *
   * The platform redelivers an operation on every poll until it is answered — that is what makes a
   * connector restart cost a round trip instead of a run. A model task takes a parent agent tens of
   * seconds to answer, so without this the queue grew one copy per poll for the whole time it was
   * being answered, and the parent then ran the same task over and over: real model calls, paid
   * for, thrown away. Kept after settling too, so a redelivery that raced the platform's deletion
   * is ignored rather than answered a second time.
   */
  private readonly seen = new Set<string>()
  /** Handed out and not yet answered. An answer is checked against the task that asked for it. */
  private readonly outstanding = new Map<string, ModelTask>()
  private readonly waiting: Waiting[] = []

  /** @returns whether the task was accepted — `false` for a redelivery of one already handed over. */
  push(task: ModelTask, opId: string): boolean {
    // The op id is refreshed even for a known task: a redelivery carries the same id today, and
    // answering the wrong operation is worse than answering none.
    this.ops.set(task.id, opId)
    if (this.seen.has(task.id)) return false
    this.seen.add(task.id)
    const next = this.waiting.shift()
    if (next != null) {
      clearTimeout(next.timer)
      next.resolve(task)

      return true
    }
    this.queue.push(task)

    return true
  }

  /** The next task, or null once `waitMs` elapses. Never rejects: nothing to do is not a failure. */
  async take(waitMs: number): Promise<ModelTask | null> {
    const ready = this.queue.shift()
    if (ready != null) {
      this.outstanding.set(ready.id, ready)

      return ready
    }
    if (waitMs <= 0) return null

    return await new Promise<ModelTask | null>(resolve => {
      const entry: Waiting = {
        resolve: task => {
          if (task != null) this.outstanding.set(task.id, task)
          resolve(task)
        },
        timer: setTimeout(() => {
          const at = this.waiting.indexOf(entry)
          if (at >= 0) this.waiting.splice(at, 1)
          resolve(null)
        }, waitMs),
      }
      this.waiting.push(entry)
    })
  }

  opIdOf(taskId: string): string | null {
    return this.ops.get(taskId) ?? null
  }

  outstandingById(taskId: string): ModelTask | null {
    return this.outstanding.get(taskId) ?? null
  }

  /** Handed out and still unanswered, oldest first. */
  outstandingTasks(): ModelTask[] {
    return [...this.outstanding.values()]
  }

  settle(taskId: string): void {
    this.ops.delete(taskId)
    this.outstanding.delete(taskId)
  }

  size(): number {
    return this.queue.length
  }
}
