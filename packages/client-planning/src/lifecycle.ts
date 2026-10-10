import { logger } from '@owlmeans/log'
import { PlanningError } from '@owlmeans/planning'
import type { PlanningClientLifecycle, PlanningClientLifecycleOptions, PlanningOperation } from './lifecycle/types.js'

const log = logger('client-planning')

export const makePlanningClientLifecycle = (opts: PlanningClientLifecycleOptions = {}): PlanningClientLifecycle => {
  let identity = opts.scopeKey?.() ?? ''
  let epoch = 0
  let tail: Promise<void> = Promise.resolve()
  let closing: Promise<void> | null = null
  let blocked = false
  let failed = false
  let empty = false
  let admissions = 0
  const operations = new Set<AbortController>()
  const listeners = new Set<() => void | Promise<void>>()
  const changed = (): PlanningError => new PlanningError('client:scope-changed')

  const cancel = (): void => {
    for (const controller of operations) controller.abort(changed())
    operations.clear()
  }
  const invalidate = (explicit = true): Promise<void> => {
    // Changing a credential cannot recover a failed clear. Only an awaited explicit retry can.
    if (!explicit && failed) { epoch++; cancel(); return Promise.resolve() }
    if (explicit && closing != null && blocked) return closing
    // An explicit close rejects admission. A newly observed identity already names the new
    // credential: its RPCs may start, but its local writes queue behind this generation's clear.
    blocked = explicit || blocked
    epoch++
    cancel()
    const admitted = admissions
    const previous = closing
    let resolve!: () => void
    let reject!: (error: unknown) => void
    const attempt = new Promise<void>((yes, no) => { resolve = yes; reject = no })
    closing = attempt
    // Reserve clearing before invalidation listeners can start work. Each observed identity
    // change reserves its own clear, including changes while an earlier close is still draining.
    const clearing = tail.then(async () => { await opts.clear?.() }).catch(error => {
      blocked = true; failed = true; cancel(); throw error
    })
    tail = clearing.catch(() => {})
    const stopping = [...listeners].map(async listener => { await listener() })
    void Promise.all([clearing, ...stopping, ...(previous != null ? [previous] : [])]).then(() => {
      if (closing === attempt) { blocked = false; failed = false; closing = null; empty = admissions === admitted }
      resolve()
    }, error => {
      if (closing === attempt) { blocked = true; failed = true; closing = null; cancel() }
      reject(error)
    })
    // key() can invalidate without an awaiting caller; still observe and report cleanup failures.
    void attempt.catch(error => log.error('Planning scope cleanup failed', error))
    return attempt
  }

  const key = (): string => {
    const current = opts.scopeKey?.() ?? ''
    if (current !== identity) {
      identity = current
      // An awaited close already drained and emptied this generation. Adopt the next credential
      // synchronously when no request/feed was admitted since, without a redundant invalidation.
      if (empty && closing == null && !blocked && !failed) epoch++
      else void invalidate(false)
    }
    return `${epoch}:${identity}`
  }

  const capture = (expected?: string): PlanningOperation => {
    const captured = key()
    if (blocked) throw changed()
    if (expected != null && expected !== captured) throw changed()
    empty = false
    admissions++
    const controller = new AbortController()
    operations.add(controller)
    const active = (): boolean => key() === captured && !blocked && !controller.signal.aborted
    const check = (): void => {
      if (key() !== captured || blocked) throw changed()
      if (controller.signal.aborted) throw controller.signal.reason
    }
    const wait = async <T>(pending: Promise<T>): Promise<T> => {
      let abort: (() => void) | undefined
      try {
        // Observe even an already-cancelled operation's pending promise; a late RPC rejection
        // must never become unhandled after its caller has left this generation.
        const cancelled = new Promise<never>((_, reject) => {
          abort = () => reject(controller.signal.reason ?? changed())
          controller.signal.addEventListener('abort', abort, { once: true })
          if (!active()) abort()
        })
        const result = await Promise.race([pending, cancelled])
        check()
        return result
      } catch (error) { check(); throw error }
      finally { if (abort != null) controller.signal.removeEventListener('abort', abort) }
    }
    return { key: captured, signal: controller.signal, active, check, wait,
      cancel: reason => { controller.abort(reason ?? changed()) }, release: () => { operations.delete(controller) } }
  }

  return {
    key, capture,
    run: async work => {
      const operation = capture()
      try { const result = await work(operation); operation.check(); return result } finally { operation.release() }
    },
    mutate: async (operation, work) => {
      const writing = tail.then(async () => {
        operation.check()
        const result = await work()
        operation.check()
        return result
      })
      tail = writing.then(() => {}, () => {})
      return await writing
    },
    drain: async () => { await tail },
    onInvalidate: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    close: async () => { identity = opts.scopeKey?.() ?? ''; await invalidate() },
  }
}
