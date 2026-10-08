import type { ConnectFeedDetail, ConnectFeedKind } from '../consts.js'

/**
 * One feed entry before it has a position — what the platform appends. Small by construction: a
 * projection of the event, never the record behind it (no namespace, no workload, no credential), and
 * prose cut to a bounded excerpt.
 */
export interface ConnectFeedRecord {
  kind: ConnectFeedKind
  /** When it happened, ISO 8601. */
  at: string
  /** The model call or platform step it belongs to. */
  run?: string
  /** The project it belongs to — on an organization notice, the project it is about, if any. */
  projectId?: string
  /** The story it belongs to. */
  storyId?: string
  /** The workload it belongs to. */
  slotId?: string
  /** The platform's own name for the step, model call or notice. */
  action?: string
  /** The platform agent that did it. */
  agent?: string
  /** Prose: a model excerpt, a notice, a step's note — bounded. */
  text?: string
  /** A small structured detail of the kind: a step's index, a card's status, a file's path. */
  data?: Record<string, unknown>
}

/** One feed entry as a read answers it: the record and its position. */
export interface ConnectFeedEntry extends ConnectFeedRecord {
  /** The entry's position — the cursor to read after it. */
  id: string
}

/** What one feed read answers. */
export interface ConnectFeedPage {
  /**
   * The cursor to pass as `after` on the next read: the last entry this read SCANNED (a filtered-out
   * entry included), or the cursor it was given when nothing came. A feed that had nothing yet
   * answers `CONNECT_FEED_START`.
   */
  cursor: string
  entries: ConnectFeedEntry[]
  /**
   * Entries after the cursor it was given were dropped before this read — the feed keeps a bounded
   * tail for a bounded time. The domain status reads (`project_status`, `story_status`, …) say where
   * the work stands.
   */
  gap: boolean
}

/** The preview's file changes, and whether its watcher runs. */
export interface ConnectFileChanges extends ConnectFeedPage {
  /**
   * The preview's file watcher is running. False while the preview is not ready: nothing records a
   * change until it runs again.
   */
  watching: boolean
}

/** A feed read's query: after which entry, how many, and how long to hold for the next one. */
export interface ConnectFeedQuery {
  /** The cursor the previous read answered; absent, the latest entries. */
  after?: string
  /** At most `CONNECT_FEED_LIMIT_MAX`; `CONNECT_FEED_LIMIT_DEFAULT` when absent. */
  limit?: number
  /** Seconds to hold for the next entry when none is there yet — at most `CONNECT_FEED_WAIT_MAX_SEC`. */
  wait?: number
}

/** The project activity read's query: a feed query and how much of the activity it answers. */
export interface ConnectActivityQuery extends ConnectFeedQuery {
  /** `progress` (absent) leaves the model's own words out; `thinking` includes them. */
  detail?: ConnectFeedDetail
}
