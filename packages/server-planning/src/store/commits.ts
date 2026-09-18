import { CommitFailed, CommitState, CommitTimeout, DEFAULT_COMMIT_TIMEOUT, WorkcardNotFound } from '@owlmeans/planning'
import type { CommitEvent, CommitFilter, CommitStatus, Unsubscribe, Workcard } from '@owlmeans/planning'
import { COMMIT_POLL_LADDER, DEFAULT_COMMIT_MEMORY } from '../consts.js'
import type { CommitHub, CommitHubOptions } from './types.js'

type Listener = (event: CommitEvent) => void | Promise<void>

const matches = (event: CommitEvent, filter?: CommitFilter): boolean =>
  filter == null || (
    (filter.entityId == null || filter.entityId === event.entityId)
    && (filter.project == null || filter.project === event.project)
    && (filter.card == null || filter.card === event.card)
    && (filter.kind == null || filter.kind === event.kind)
  )

const settled = (state: CommitState): boolean => state !== CommitState.Pending

const failureOf = (transition: string, error?: string): CommitFailed =>
  new CommitFailed(`${transition}:${error ?? 'unknown'}`)

/**
 * An in-process commit fan-out with a status lookup.
 *
 * It is the `CommitSource` a store answers with: the memory store publishes into it from its fold,
 * and a durable store feeds it from its own bus (a Redis subscription) while answering `status`
 * from its transition rows. It never decides anything about a commit — it only delivers events and
 * waits for them.
 *
 * `wait` subscribes FIRST and polls second, so a commit that lands between the two is never
 * missed; after one immediate poll it climbs `ladder`, which is what answers when the fold
 * published somewhere this hub does not hear.
 */
export const makeCommitHub = (options: CommitHubOptions): CommitHub => {
  const listeners = new Set<{ listener: Listener, filter?: CommitFilter }>()
  const memory = new Map<string, CommitEvent>()
  const remember = options.remember ?? DEFAULT_COMMIT_MEMORY
  const ladder = options.ladder != null && options.ladder.length > 0 ? options.ladder : COMMIT_POLL_LADDER

  const remembered = (event: CommitEvent): void => {
    if (!settled(event.state) || remember <= 0) {
      return
    }
    memory.delete(event.transition)
    memory.set(event.transition, event)
    while (memory.size > remember) {
      const oldest = memory.keys().next().value
      if (oldest == null) {
        break
      }
      memory.delete(oldest)
    }
  }

  const hub: CommitHub = {
    publish: async event => {
      remembered(event)
      const targets = [...listeners].filter(entry => matches(event, entry.filter))
      const results = await Promise.allSettled(targets.map(async entry => await entry.listener(event)))
      results.forEach(result => {
        if (result.status === 'rejected') {
          console.error('planning: commit listener failed:', result.reason)
        }
      })
    },

    recall: transition => memory.get(transition),

    listeners: () => listeners.size,

    subscribe: (listener, filter) => {
      const entry = { listener, filter }
      listeners.add(entry)

      const unsubscribe: Unsubscribe = () => { listeners.delete(entry) }
      return unsubscribe
    },

    status: async transition => {
      const found = await options.status(transition)
      if (found != null) {
        return found
      }
      const event = memory.get(transition)
      if (event != null) {
        const status: CommitStatus = { transition, state: event.state, at: event.at }
        if (event.error != null) {
          status.error = event.error
        }
        if (event.record !== undefined) {
          status.card = event.record
        }
        return status
      }

      throw new WorkcardNotFound(`transition:${transition}`)
    },

    wait: async (transition, opts) => {
      const timeout = opts?.timeout ?? DEFAULT_COMMIT_TIMEOUT

      return await new Promise<Workcard | null>((resolve, reject) => {
        let done = false
        let step = 0
        let poller: ReturnType<typeof setTimeout> | undefined
        let unsubscribe: Unsubscribe = () => undefined

        const finish = (settle: () => void): void => {
          if (done) {
            return
          }
          done = true
          clearTimeout(deadline)
          clearTimeout(poller)
          unsubscribe()
          settle()
        }

        const committedCard = async (record?: Workcard | null): Promise<Workcard | null> => {
          if (record !== undefined) {
            return record
          }
          try {
            return (await hub.status(transition)).card ?? null
          } catch {
            return null
          }
        }

        const answer = async (state: CommitState, error?: string, record?: Workcard | null): Promise<boolean> => {
          if (state === CommitState.Committed) {
            const card = await committedCard(record)
            finish(() => resolve(card))
            return true
          }
          if (state === CommitState.Failed) {
            finish(() => reject(failureOf(transition, error)))
            return true
          }
          return false
        }

        const deadline = setTimeout(() => finish(() => reject(new CommitTimeout(transition))), timeout)

        unsubscribe = hub.subscribe(async event => {
          if (event.transition === transition) {
            await answer(event.state, event.error, event.record)
          }
        }) as Unsubscribe

        const poll = async (): Promise<void> => {
          if (done) {
            return
          }
          try {
            const status = await hub.status(transition)
            if (await answer(status.state, status.error, status.card)) {
              return
            }
          } catch (error) {
            finish(() => reject(error))
            return
          }
          if (!done) {
            poller = setTimeout(() => { void poll() }, ladder[Math.min(step++, ladder.length - 1)])
          }
        }

        void poll()
      })
    },
  }

  return hub
}
