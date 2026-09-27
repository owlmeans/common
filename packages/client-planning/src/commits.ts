import type { BasicConfig, BasicContext } from '@owlmeans/context'
import {
  CommitFailed, CommitState, CommitTimeout, DEFAULT_COMMIT_POLL, DEFAULT_COMMIT_TIMEOUT, MAX_COMMIT_POLL,
  PLANNING_COMMIT_EVENT, PlanningError, WorkcardKind,
} from '@owlmeans/planning'
import type {
  CommitEvent, CommitFilter, CommitStatus, PlanningProtocols, Unsubscribe, Workcard,
} from '@owlmeans/planning'
import type { Connection } from '@owlmeans/socket'
import { EARLY_POLL_LADDER, EARLY_POLL_MS, LONG_POLL_GRACE } from './consts.js'
import type { RemoteCommitSource, RemoteCommitSourceOptions } from './types.js'
import { dropCard, putCard, putCommit } from './utils/record.js'

interface Subscription {
  listener: (event: CommitEvent) => void | Promise<void>
  filter?: CommitFilter
}

const matches = (filter: CommitFilter | undefined, event: CommitEvent): boolean =>
  filter == null || (
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

/**
 * The commit source of a remote facade: the `commit.get` long poll and, when the host injects a
 * socket opener, the `commit.events` feed.
 *
 * `wait` SUBSCRIBES FIRST and only then reads the status — a commit landing between a read and a
 * subscription would otherwise be missed until the deadline. It then long-polls in holds of
 * `min(poll, remaining)` seconds, so a client with no socket (a Node connector) still learns of a
 * commit within one round trip of it landing, and a client with one learns from whichever arrives
 * first. The deadline is a {@link CommitTimeout}; the transition stays pending — nothing is undone.
 *
 * ONE socket serves every subscription of the source; releasing a subscription never closes it.
 */
export const makeRemoteCommitSource = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, protocols: PlanningProtocols, opts?: RemoteCommitSourceOptions
): RemoteCommitSource => {
  const poll = Math.max(0, Math.min(MAX_COMMIT_POLL, opts?.poll ?? DEFAULT_COMMIT_POLL))
  const subscriptions = new Set<Subscription>()

  let opening: Promise<Connection | null> | null = null
  let open: Connection | null = null
  let detach: (() => void) | null = null

  const dispatch = async (event: CommitEvent): Promise<void> => {
    for (const subscription of [...subscriptions]) {
      if (!matches(subscription.filter, event)) {
        continue
      }
      try {
        await subscription.listener(event)
      } catch (e) {
        console.error('Planning commit listener error:', e)
      }
    }
  }

  const socket = async (): Promise<Connection | null> => {
    const opener = opts?.socket
    if (opener == null) {
      return null
    }
    opening ??= (async () => {
      try {
        const connection = await opener(protocols.commit.events, { query: {} })
        if (connection == null) {
          // No socket right now (not signed in yet, say) — the next subscription asks again.
          opening = null
          return null
        }
        open = connection
        detach = connection.observe<CommitEvent>(PLANNING_COMMIT_EVENT, async message => {
          await dispatch(message.payload)
        })
        return connection
      } catch (e) {
        opening = null
        console.error('Planning commit socket error:', e)
        return null
      }
    })()

    return await opening
  }

  const endpoint = () => context.entrypoint(protocols.commit.get)

  const status = async (transition: string): Promise<CommitStatus> => await endpoint().call({
    params: { transition }, query: { wait: 0 }, timeout: opts?.timeout,
  })

  const hold = async (transition: string, wait: number, signal: AbortSignal): Promise<CommitStatus> => {
    try {
      return await endpoint().call({
        params: { transition }, query: { wait }, timeout: wait * 1000 + LONG_POLL_GRACE, signal,
      })
    } catch (e) {
      if (signal.aborted || e instanceof PlanningError) {
        throw e
      }
      // A dropped hold (a proxy closing an idle response) is not an answer about the commit: one
      // non-holding read replaces it, and a failure of THAT is reported.
      return await status(transition)
    }
  }

  /** Fold a settled status into the mirror, when the host registered one. */
  const fold = async (transition: string, settled: CommitStatus): Promise<void> => {
    const stores = opts?.stores?.()
    if (stores == null) {
      return
    }
    const known = await stores.commits.load(transition)
    await putCommit(stores.commits, {
      id: transition, state: settled.state, at: settled.at, error: settled.error,
    })
    if (settled.state !== CommitState.Committed) {
      return
    }
    if (settled.card != null) {
      await putCard(stores.cards, settled.card)
    } else if (settled.card === null && known?.card != null) {
      await dropCard(stores, known.card, known.kind === WorkcardKind.Project)
    }
  }

  const answer = async (transition: string, settled: CommitStatus): Promise<Workcard | null> => {
    await fold(transition, settled)
    if (settled.state === CommitState.Failed) {
      throw new CommitFailed(settled.error ?? transition)
    }

    return settled.card ?? null
  }

  const subscribe = async (
    listener: Subscription['listener'], filter?: CommitFilter
  ): Promise<Unsubscribe> => {
    const subscription: Subscription = { listener, filter }
    subscriptions.add(subscription)
    await socket()

    return () => { subscriptions.delete(subscription) }
  }

  const source: RemoteCommitSource = {
    status,

    subscribe,

    wait: async (transition, waitOpts) => {
      const deadline = Date.now() + (waitOpts?.timeout ?? DEFAULT_COMMIT_TIMEOUT)
      // Held in an object: a frame writes it from a callback, which flow analysis cannot see.
      const frame: { landed: CommitEvent | null } = { landed: null }
      let wake: () => void = () => { }
      const unsubscribe = await subscribe(event => {
        if (event.transition === transition && event.state !== CommitState.Pending) {
          frame.landed = event
          wake()
        }
      })

      /** A frame says it settled; the status read carries the card when the frame does not. */
      const fromFrame = async (event: CommitEvent): Promise<Workcard | null> => event.record !== undefined
        ? await answer(transition, {
          transition, state: event.state, at: event.at, error: event.error, card: event.record,
        })
        : await answer(transition, await status(transition))

      try {
        let current = await status(transition)
        let early = 0
        while (current.state === CommitState.Pending) {
          if (frame.landed != null) {
            return await fromFrame(frame.landed)
          }
          const remaining = deadline - Date.now()
          if (remaining <= 0) {
            throw new CommitTimeout(transition)
          }

          const wait = Math.min(poll, Math.ceil(remaining / 1000))
          const abort = new AbortController()
          const timer = delay(remaining)
          const framed = new Promise<'frame'>(resolve => { wake = () => resolve('frame') })
          const started = Date.now()
          try {
            const outcome = await Promise.race([
              hold(transition, wait, abort.signal),
              framed,
              timer.promise.then(() => 'deadline' as const),
            ])
            if (outcome === 'frame' || outcome === 'deadline') {
              continue
            }
            current = outcome
          } finally {
            abort.abort()
            timer.cancel()
            wake = () => { }
          }

          if (current.state === CommitState.Pending && Date.now() - started < EARLY_POLL_MS) {
            // The server did not hold — pause on a ladder rather than spin until the deadline.
            const pause = delay(Math.min(
              EARLY_POLL_LADDER[Math.min(early, EARLY_POLL_LADDER.length - 1)], deadline - Date.now()
            ))
            early += 1
            await Promise.race([pause.promise, new Promise<void>(resolve => { wake = resolve })])
            pause.cancel()
            wake = () => { }
          } else {
            early = 0
          }
        }

        return await answer(transition, current)
      } finally {
        unsubscribe()
      }
    },

    connected: () => open != null,

    close: async () => {
      detach?.()
      detach = null
      const connection = open
      open = null
      opening = null
      await connection?.close()
    },
  }

  return source
}
