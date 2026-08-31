import type { AgentRunMessage } from '@owlmeans/agent-common'

/**
 * How a run's advance reaches whoever will carry it out.
 *
 * The seam exists so that recoverability and scaling can be added without touching the loop: an
 * application that wants runs to survive a pod restart, or to spread across replicas, binds a
 * queue here. Nothing in this package requires one, and the default carries messages by calling
 * the handler directly.
 *
 * A message carries the serialized flow but only a REFERENCE to the execution state, because a
 * project-level execution's state holds the whole project specification and a queue whose messages
 * carry that falls over on the first large project.
 */
export interface AgentTransport {
  dispatch: (message: AgentRunMessage) => Promise<void>
  /** Subscribe; resolves to an unsubscribe function. */
  consume: (handler: (message: AgentRunMessage) => Promise<void>) => Promise<() => Promise<void>>
}

/**
 * The default: deliver to whoever is subscribed, in this process, right now.
 *
 * A dispatch with no subscriber is dropped rather than queued. That is the honest behaviour for an
 * in-process transport — pretending to buffer would make an application believe it had durability
 * it does not have, and the whole point of the seam is that durability is the queue's job.
 */
export const inProcessTransport = (): AgentTransport => {
  const handlers = new Set<(message: AgentRunMessage) => Promise<void>>()

  return {
    dispatch: async message => {
      await Promise.all([...handlers].map(async handler => {
        try {
          await handler(message)
        } catch (e) {
          // One subscriber's failure must not swallow the others', and a transport is not the
          // place a run's error is decided.
          console.error('AgentTransport handler failed:', e)
        }
      }))
    },

    consume: async handler => {
      handlers.add(handler)

      return async () => { handlers.delete(handler) }
    },
  }
}
