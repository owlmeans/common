import type { InquiryTransport } from '@owlmeans/llm-common'

/**
 * Which channel reaches which person.
 *
 * Keyed by string, exactly like the delegate-transport registry beside it: a process holds many
 * at once — one per connected agent, one per open browser session — and an execution names the
 * one its run belongs to. Seating is what an application does when a channel attaches; releasing
 * is what it does when one goes away, and a question that arrives afterwards fails immediately
 * rather than hanging on nobody.
 */
export interface InquiryTransportRegistry {
  /** Seat a transport under a key, replacing whatever was there. */
  register: (key: string, transport: InquiryTransport) => void
  release: (key: string) => void
  has: (key: string) => boolean
  /**
   * The transport for a key, or a fatal refusal — never a wait.
   *
   * @throws {InquiryUnavailable} when nothing is seated under the key
   */
  transportFor: (key: string | undefined) => InquiryTransport
}
