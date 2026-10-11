import type { InquiryOpenEvent, InquiryRuntime } from '@owlmeans/common-inquiry'

export interface InquiryOpenHandler { (event: InquiryOpenEvent): void }

/**
 * The page-wide half of the SDK, shared by every client: one script per CRM url, one pending load,
 * and one `onOpen` per runtime that routes each open to the client that owns the widget.
 */
export interface InquiryLoaderUtils {
  /** The runtime served at `url` — injected once, its version checked; a failed load can be retried. */
  load: (url: string, timeoutMs: number) => Promise<InquiryRuntime>
  /** Route the opens of widget `id` (and those of any widget no client claimed) to `handler`. */
  claim: (url: string, id: string, handler: InquiryOpenHandler) => void
  /** The one `onOpen` the runtime of `url` is configured with. */
  dispatcher: (url: string) => InquiryOpenHandler
}

/** Who hears the opens of one runtime: the claimant of each widget, else the latest claimant. */
export interface InquiryOpenRoute {
  handlers: Map<string, InquiryOpenHandler>
  last?: InquiryOpenHandler
  dispatch: InquiryOpenHandler
}
