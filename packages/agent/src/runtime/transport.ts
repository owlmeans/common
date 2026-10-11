import type { AgentRunMessage } from '@owlmeans/agent-common'
import { logger } from '@owlmeans/log'
import type { AgentTransport } from './types.js'

const log = logger('agent:transport')

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
          log.error('AgentTransport handler failed', e)
        }
      }))
    },

    consume: async handler => {
      handlers.add(handler)

      return async () => { handlers.delete(handler) }
    },
  }
}
