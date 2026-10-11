import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { logger } from '@owlmeans/log'
import { planningReplyHelper, CommitFailed, CommitState, CommitTimeout, DEFAULT_COMMIT_POLL, DEFAULT_COMMIT_TIMEOUT, MAX_COMMIT_POLL, PLANNING_COMMIT_EVENT, PlanningError, WorkcardKind, type CommitEvent, type CommitFilter, type CommitStatus, type PlanningProtocols, type Unsubscribe, type Workcard } from '@owlmeans/planning'
import type { Connection } from '@owlmeans/socket'
import { EARLY_POLL_LADDER, EARLY_POLL_MS, LONG_POLL_GRACE } from './consts.js'
import { makePlanningClientLifecycle } from './lifecycle.js'
import type { PlanningOperation } from './lifecycle/types.js'
import type { RemoteCommitSource, RemoteCommitSourceOptions } from './types.js'
import type { CommitSocketOpening, Subscription } from './types.local.js'
import { recordUtils } from './utils/record.js'

const log = logger('client-planning')

/** Subscribe before reading, then race the shared socket against bounded HTTP holds. */
export const makeRemoteCommitSource = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, protocols: PlanningProtocols, opts?: RemoteCommitSourceOptions
): RemoteCommitSource => {
  const lifecycle = opts?.lifecycle ?? makePlanningClientLifecycle({ scopeKey: opts?.scopeKey })
  const poll = Math.max(0, Math.min(MAX_COMMIT_POLL, opts?.poll ?? DEFAULT_COMMIT_POLL))
  const subscriptions = new Set<Subscription>()
  const operations = new Set<PlanningOperation>()
  let opening: CommitSocketOpening | null = null
  const openingOf = (): CommitSocketOpening | null => opening
  let open: Connection | null = null
  let detach: (() => void) | null = null

  const capture = (): PlanningOperation => {
    const captured = lifecycle.capture()
    const operation: PlanningOperation = { ...captured, release: () => {
      operations.delete(operation)
      captured.release()
    } }
    operations.add(operation)
    return operation
  }
  const matches = (filter: CommitFilter | undefined, event: CommitEvent): boolean => filter == null || (
    (filter.entityId == null || filter.entityId === event.entityId)
    && (filter.project == null || filter.project === event.project)
    && (filter.card == null || filter.card === event.card)
    && (filter.kind == null || filter.kind === event.kind)
  )
  const delay = (ms: number): { promise: Promise<void>, cancel: () => void } => {
    let handle: ReturnType<typeof setTimeout> | undefined
    const promise = new Promise<void>(resolve => { handle = setTimeout(resolve, Math.max(0, ms)) })
    return { promise, cancel: () => clearTimeout(handle) }
  }
  const dispatch = async (event: CommitEvent): Promise<void> => {
    for (const subscription of [...subscriptions]) {
      if (!subscriptions.has(subscription) || !subscription.operation.active() || !matches(subscription.filter, event)) continue
      try { await subscription.operation.wait(Promise.resolve(subscription.listener(event))) }
      catch (error) { if (subscription.operation.active()) log.error('Planning commit listener failed', error) }
    }
  }

  const socket = async (): Promise<Connection | null> => {
    const opener = opts?.socket
    if (opener == null) return null
    lifecycle.key() // Observe an identity change before reusing an open carrier.
    if (open != null) return open
    if (opening != null) return await opening.promise
    const operation = capture()
    const pending = (async () => {
      try {
        const carrier = Promise.resolve().then(async () => {
          operation.check()
          return await opener(protocols.commit.events, { query: {}, signal: operation.signal })
        }).then(async connection => {
          if (connection == null) return null
          if (!operation.active()) { await connection.close(); return null }
          open = connection
          detach = connection.observe<CommitEvent>(PLANNING_COMMIT_EVENT, async message => {
            if (operation.active()) await dispatch(planningReplyHelper.hydrate<CommitEvent>(message.payload))
          })
          return connection
        })
        return await operation.wait(carrier)
      } catch (error) {
        if (operation.active()) log.warn('Planning commit socket failed to open', error)
        return null
      } finally {
        if (openingOf()?.operation === operation) opening = null
        // Keep an open carrier's operation cancellable until close; it guards received frames.
        if (open == null || !operation.active()) operation.release()
      }
    })()
    opening = { operation, promise: pending }
    return await pending
  }

  const endpoint = () => context.entrypoint(protocols.commit.get)
  const status = async (transition: string, operation: PlanningOperation): Promise<CommitStatus> => {
    operation.check()
    return planningReplyHelper.hydrate<CommitStatus>(await operation.wait(endpoint().call({
      params: { transition }, query: { wait: 0 }, timeout: opts?.timeout, signal: operation.signal,
    })))
  }
  const hold = async (transition: string, wait: number, signal: AbortSignal, operation: PlanningOperation): Promise<CommitStatus> => {
    operation.check()
    try {
      return planningReplyHelper.hydrate<CommitStatus>(await operation.wait(endpoint().call({
        params: { transition }, query: { wait }, timeout: wait * 1000 + LONG_POLL_GRACE, signal,
      })))
    } catch (error) {
      operation.check()
      if (signal.aborted || error instanceof PlanningError) throw error
      // A dropped hold says nothing about the commit. Never retry it under another scope.
      return await status(transition, operation)
    }
  }
  const answer = async (transition: string, settled: CommitStatus, operation: PlanningOperation): Promise<Workcard | null> => {
    const stores = opts?.stores?.()
    if (stores != null) await lifecycle.mutate(operation, async () => {
      const known = await stores.commits.load(transition)
      await recordUtils.putCommit(stores.commits, {
        id: transition, state: settled.state, at: settled.at, error: settled.error,
      })
      if (settled.state === CommitState.Committed) {
        if (settled.card != null) await recordUtils.putCard(stores.cards, settled.card)
        else if (settled.card === null && known?.card != null) await recordUtils.dropCard(stores, known.card, known.kind === WorkcardKind.Project)
      }
    })
    operation.check()
    if (settled.state === CommitState.Failed) throw new CommitFailed(settled.error ?? transition)
    return settled.card ?? null
  }
  const subscribe = async (listener: Subscription['listener'], filter?: CommitFilter, signal?: AbortSignal): Promise<Unsubscribe> => {
    const operation = capture()
    const subscription: Subscription = { listener, filter, operation }
    subscriptions.add(subscription)
    const stop = (): void => {
      subscriptions.delete(subscription); operation.cancel(); operation.release()
      signal?.removeEventListener('abort', stop)
    }
    signal?.addEventListener('abort', stop, { once: true })
    if (signal?.aborted) stop()
    try { await operation.wait(socket()); return stop }
    catch (error) { stop(); throw error }
  }
  const close = async (): Promise<void> => {
    for (const operation of operations) { operation.cancel(); operation.release() }
    subscriptions.clear()
    detach?.(); detach = null
    const connection = open
    open = null; opening = null
    await Promise.all([connection?.close(), lifecycle.drain()])
  }
  lifecycle.onInvalidate(close)

  return {
    status: async transition => {
      const operation = capture()
      try { return await status(transition, operation) } finally { operation.release() }
    },
    subscribe,
    wait: async (transition, waitOpts) => {
      const operation = capture()
      const duration = waitOpts?.timeout ?? DEFAULT_COMMIT_TIMEOUT
      const deadline = Date.now() + duration
      const deadlineTimer = setTimeout(() => operation.cancel(new CommitTimeout(transition)), Math.max(0, duration))
      const frame: { landed: CommitEvent | null } = { landed: null }
      let wake: () => void = () => {}
      let unsubscribe: Unsubscribe | undefined
      try {
        const subscribing = subscribe(event => {
          if (operation.active() && event.transition === transition && event.state !== CommitState.Pending) { frame.landed = event; wake() }
        }, undefined, operation.signal)
        // A cancelled waiter must also release a subscription whose opener completes later.
        void subscribing.then(stop => { if (!operation.active()) stop() }, () => {})
        unsubscribe = await operation.wait(subscribing)
        const fromFrame = async (event: CommitEvent): Promise<Workcard | null> => await answer(transition,
          event.record !== undefined
            ? { transition, state: event.state, at: event.at, error: event.error, card: event.record }
            : await status(transition, operation), operation)
        let current = await status(transition, operation)
        let early = 0
        while (current.state === CommitState.Pending) {
          operation.check()
          if (frame.landed != null) return await fromFrame(frame.landed)
          const remaining = deadline - Date.now()
          if (remaining <= 0) throw new CommitTimeout(transition)
          const wait = Math.min(poll, Math.ceil(remaining / 1000))
          const abort = new AbortController()
          const cancel = () => abort.abort(operation.signal.reason)
          operation.signal.addEventListener('abort', cancel, { once: true })
          const timer = delay(remaining)
          const framed = new Promise<'frame'>(resolve => { wake = () => resolve('frame') })
          const started = Date.now()
          try {
            const outcome = await operation.wait(Promise.race([
              hold(transition, wait, abort.signal, operation), framed, timer.promise.then(() => 'deadline' as const),
            ]))
            if (outcome === 'frame' || outcome === 'deadline') continue
            current = outcome
          } finally {
            abort.abort(); timer.cancel(); wake = () => {}
            operation.signal.removeEventListener('abort', cancel)
          }
          if (current.state === CommitState.Pending && Date.now() - started < EARLY_POLL_MS) {
            const pause = delay(Math.min(EARLY_POLL_LADDER[Math.min(early, EARLY_POLL_LADDER.length - 1)], deadline - Date.now()))
            early++
            try { await operation.wait(Promise.race([pause.promise, new Promise<void>(resolve => { wake = resolve })])) }
            finally { pause.cancel(); wake = () => {} }
          } else early = 0
        }
        return await answer(transition, current, operation)
      } finally {
        clearTimeout(deadlineTimer)
        unsubscribe?.()
        operation.cancel(); operation.release()
      }
    },
    connected: () => { lifecycle.key(); return open != null },
    close,
  }
}
