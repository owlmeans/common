
/**
 * Operations waiting for the parent agent — the model calls it performs, and the questions it
 * puts to a person.
 *
 * A queue rather than a callback because of who drains it: the parent agent asks for work when it
 * is ready, through a tool call, and may take minutes to answer. Nothing here pushes — the whole
 * point of the local-LLM mode is that the platform waits on somebody else's schedule, and a
 * question waits on a slower schedule still.
 *
 * Generic over the payload rather than copied per kind: both of them are handed out once, both are
 * redelivered by the platform until they are answered, and both route their answer back on an
 * operation id. A second copy of these rules is a second place for the redelivery guard to be
 * forgotten, and the symptom of forgetting it is real model calls paid for and thrown away.
 *
 * The operation id is kept beside each item and never shown to the parent. It is what an answer is
 * routed back on, and a parent that could name one could answer an operation it was never given.
 */
import type { Waiting, Watching } from './types.js'

export class OpQueue<T extends { id: string }> {
  private readonly queue: T[] = []
  private readonly ops = new Map<string, string>()
  /**
   * Every item this session has ever been handed.
   *
   * The platform redelivers an operation on every poll until it is answered — that is what makes a
   * connector restart cost a round trip instead of a run. A model task takes a parent agent tens of
   * seconds to answer, so without this the queue grew one copy per poll for the whole time it was
   * being answered, and the parent then ran the same task over and over: real model calls, paid
   * for, thrown away. Kept after settling too, so a redelivery that raced the platform's deletion
   * is ignored rather than answered a second time.
   */
  private readonly seen = new Set<string>()
  /**
   * Handed out and not yet answered. An answer is checked against the item that asked for it.
   *
   * Named `held` rather than `outstanding` so the public reading of it can carry that name: the
   * two subclasses expose it as `outstandingTasks()` / `outstandingQuestions()`, and a field and
   * a method cannot share one name.
   */
  private readonly held = new Map<string, T>()
  private readonly waiting: Array<Waiting<T>> = []
  /** Callers told when an item is QUEUED, without taking it — see {@link OpQueue.available}. */
  private readonly watching: Watching[] = []

  /**
   * @param order Which queued item goes first; absent, the oldest. Applied only among items that
   *   are queued — one pushed while a caller waits goes straight to that caller.
   */
  constructor(private readonly order?: (a: T, b: T) => number) {}

  /** @returns whether the item was accepted — `false` for a redelivery of one already handed over. */
  push(item: T, opId: string): boolean {
    // The op id is refreshed even for a known item: a redelivery carries the same id today, and
    // answering the wrong operation is worse than answering none.
    this.ops.set(item.id, opId)
    if (this.seen.has(item.id)) return false
    this.seen.add(item.id)
    const next = this.waiting.shift()
    if (next != null) {
      next.resolve(item)

      return true
    }
    this.queue.push(item)
    for (const watcher of this.watching.splice(0)) watcher.resolve(true)

    return true
  }

  /**
   * The next item, or null once `waitMs` elapses or `signal` aborts. Never rejects: nothing to do
   * is not a failure.
   *
   * An aborted wait is REMOVED, not merely ignored. A caller that gave up — a tool that answered on
   * something else first — would otherwise leave a waiter behind that swallows the next item: handed
   * out to nobody, held as outstanding, and never shown to the parent that has to perform it.
   */
  async take(waitMs: number, signal?: AbortSignal): Promise<T | null> {
    const ready = this.shiftReady()
    if (ready != null) {
      this.held.set(ready.id, ready)

      return ready
    }
    if (waitMs <= 0 || signal?.aborted === true) return null

    return await new Promise<T | null>(resolve => {
      const leave = (): void => {
        clearTimeout(entry.timer)
        signal?.removeEventListener('abort', abandon)
        const at = this.waiting.indexOf(entry)
        if (at >= 0) this.waiting.splice(at, 1)
      }
      const abandon = (): void => {
        leave()
        resolve(null)
      }
      const entry: Waiting<T> = {
        resolve: item => {
          leave()
          if (item != null) this.held.set(item.id, item)
          resolve(item)
        },
        timer: setTimeout(abandon, waitMs),
      }
      signal?.addEventListener('abort', abandon, { once: true })
      this.waiting.push(entry)
    })
  }

  /**
   * Whether an item is queued, waiting up to `waitMs` for one; consumes nothing.
   *
   * For a caller that races an item against something else and must not take one it may not use:
   * it learns one is there, then takes it with `take(0)` — which may still answer null when another
   * caller was quicker, so the race goes on.
   */
  async available(waitMs: number, signal?: AbortSignal): Promise<boolean> {
    if (this.queue.length > 0) return true
    if (waitMs <= 0 || signal?.aborted === true) return false

    return await new Promise<boolean>(resolve => {
      const leave = (): void => {
        clearTimeout(entry.timer)
        signal?.removeEventListener('abort', abandon)
        const at = this.watching.indexOf(entry)
        if (at >= 0) this.watching.splice(at, 1)
      }
      const abandon = (): void => {
        leave()
        resolve(false)
      }
      const entry: Watching = {
        resolve: ready => {
          leave()
          resolve(ready)
        },
        timer: setTimeout(abandon, waitMs),
      }
      signal?.addEventListener('abort', abandon, { once: true })
      this.watching.push(entry)
    })
  }

  opIdOf(id: string): string | null {
    return this.ops.get(id) ?? null
  }

  outstandingById(id: string): T | null {
    return this.held.get(id) ?? null
  }

  /** Handed out and still unanswered, oldest first. */
  outstanding(): T[] {
    return [...this.held.values()]
  }

  settle(id: string): void {
    this.ops.delete(id)
    this.held.delete(id)
  }

  size(): number {
    return this.queue.length
  }

  private shiftReady(): T | undefined {
    if (this.order == null || this.queue.length < 2) return this.queue.shift()
    let first = 0
    for (let at = 1; at < this.queue.length; at++) {
      if (this.order(this.queue[at]!, this.queue[first]!) < 0) first = at
    }

    return this.queue.splice(first, 1)[0]
  }
}
