import type { ConnectFeedEntry, ConnectFeedPage } from '@owlmeans/viable-common'

/** What a feed read's answer is told about where it came from and how to read on. */
export interface FeedPageOptions {
  /** The sentence for a read that found nothing new, e.g. `No new activity.` */
  empty: string
  /** The exact call that reads on from the cursor this page answered. */
  next: string
}

/** How the feed tools put a page of entries into words. */
export interface FeedToolHelper {
  /** One entry as one line: its time, what happened and the detail that matters. */
  renderEntry: (entry: ConnectFeedEntry) => string
  /**
   * A page: a dropped stretch first (with where the work's status is read instead), the entries,
   * then the cursor and the exact call that reads on.
   */
  renderPage: (page: ConnectFeedPage, opts: FeedPageOptions) => string
  /** The call that reads on from a cursor: `<tool> {"…":…,"after":"<cursor>","wait":20}`. */
  nextCall: (tool: string, args: Record<string, unknown>, cursor: string) => string
}
