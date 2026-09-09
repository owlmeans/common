import type { DelegateTransport } from '@owlmeans/llm-common'
import { DelegateUnavailable } from './errors.js'

/**
 * Which performer answers which model.
 *
 * Module-level and keyed by string, exactly like the provider-plugin registry beside it — a
 * process holds many at once, one per connected agent, and a model config names the one its run
 * belongs to. Seating is what an application does when a connector attaches; releasing is what it
 * does when one goes away, and a call that arrives afterwards fails immediately rather than
 * hanging on a transport nobody is behind.
 */
const transports: Record<string, DelegateTransport> = {}

export const registerDelegateTransport = (key: string, transport: DelegateTransport): void => {
  transports[key] = transport
}

export const releaseDelegateTransport = (key: string): void => {
  delete transports[key]
}

export const hasDelegateTransport = (key: string): boolean => transports[key] != null

/** The transport for a key, or a fatal refusal — never a wait. */
export const transportFor = (key: string | undefined): DelegateTransport => {
  if (key == null || transports[key] == null) {
    throw new DelegateUnavailable(key ?? 'unkeyed')
  }

  return transports[key]
}
