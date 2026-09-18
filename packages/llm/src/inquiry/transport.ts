import type { InquiryTransport } from '@owlmeans/llm-common'
import { registerFatalError } from '../helpers/retry.js'
import { InquiryUnavailable } from './errors.js'

/**
 * Which channel reaches which person.
 *
 * Module-level and keyed by string, exactly like the delegate-transport registry beside it: a
 * process holds many at once — one per connected agent, one per open browser session — and an
 * execution names the one its run belongs to. Seating is what an application does when a channel
 * attaches; releasing is what it does when one goes away, and a question that arrives afterwards
 * fails immediately rather than hanging on nobody.
 */
const transports: Record<string, InquiryTransport> = {}

export const registerInquiryTransport = (key: string, transport: InquiryTransport): void => {
  transports[key] = transport
}

export const releaseInquiryTransport = (key: string): void => {
  delete transports[key]
}

export const hasInquiryTransport = (key: string): boolean => transports[key] != null

/**
 * The transport for a key, or a fatal refusal — never a wait.
 *
 * Named `inquiryTransportFor` rather than `transportFor`: `@owlmeans/llm` and
 * `@owlmeans/llm-delegate` are re-exported into one namespace by `@owlmeans/viable`.
 */
export const inquiryTransportFor = (key: string | undefined): InquiryTransport => {
  if (key == null || transports[key] == null) {
    throw new InquiryUnavailable(key ?? 'unkeyed')
  }

  return transports[key]
}

// Beside the throw, so no caller has to remember: an absent channel aborts every retry loop at
// once instead of being spent through as if the answer might come next time.
registerFatalError(e => e instanceof InquiryUnavailable ? e : null)
