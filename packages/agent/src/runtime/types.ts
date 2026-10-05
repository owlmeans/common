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
