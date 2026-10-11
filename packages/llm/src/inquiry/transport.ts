import type { InquiryTransport } from '@owlmeans/llm-common'
import { retryHelper } from '../helpers/retry.js'
import { InquiryUnavailable } from './errors.js'
import type { InquiryTransportRegistry } from './transport/types.js'

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

// Beside the throw, so no caller has to remember: an absent channel aborts every retry loop at
// once instead of being spent through as if the answer might come next time.
retryHelper.registerFatalError(e => e instanceof InquiryUnavailable ? e : null)

export const createInquiryTransportRegistry = (): InquiryTransportRegistry => {
  const register = (key: string, transport: InquiryTransport): void => {
    transports[key] = transport
  }

  const release = (key: string): void => {
    delete transports[key]
  }

  const has = (key: string): boolean => transports[key] != null

  const transportFor = (key: string | undefined): InquiryTransport => {
    if (key == null || transports[key] == null) {
      throw new InquiryUnavailable(key ?? 'unkeyed')
    }

    return transports[key]
  }

  return { register, release, has, transportFor }
}

export const inquiryTransportRegistry = createInquiryTransportRegistry()

/** @deprecated compat:factory-refactor — use `inquiryTransportRegistry.register(…)` */
export const registerInquiryTransport = (key: string, transport: InquiryTransport): void =>
  inquiryTransportRegistry.register(key, transport)

/** @deprecated compat:factory-refactor — use `inquiryTransportRegistry.release(…)` */
export const releaseInquiryTransport = (key: string): void => inquiryTransportRegistry.release(key)

/** @deprecated compat:factory-refactor — use `inquiryTransportRegistry.has(…)` */
export const hasInquiryTransport = (key: string): boolean => inquiryTransportRegistry.has(key)

/** @deprecated compat:factory-refactor — use `inquiryTransportRegistry.transportFor(…)` */
export const inquiryTransportFor = (key: string | undefined): InquiryTransport => inquiryTransportRegistry.transportFor(key)
