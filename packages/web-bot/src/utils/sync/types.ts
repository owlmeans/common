/** What a change touched, so the panels that show it read again. */
export type BotSyncTopic = 'connections' | 'activity'

/** A hook's own "read again", kept stable for the hook's lifetime — it is also how it is told apart. */
export interface BotSyncListener {
  (): void
}

/**
 * Keeps every hook over the SAME surface in step: a connection added, renamed or removed in the
 * connections panel reaches the screen's own list and the activity panel's connection labels —
 * without a reload of the page.
 *
 * Surfaces are told apart by their base alias, so two bindings of one mount are one surface.
 */
export interface BotSyncUtils {
  /** Listen for changes of `topic` on the surface `alias`; answers the unsubscribe. */
  subscribe: (alias: string, topic: BotSyncTopic, listener: BotSyncListener) => () => void
  /** Tell every listener of the surface's `topic` but `origin` — the hook that made the change. */
  publish: (alias: string, topic: BotSyncTopic, origin?: BotSyncListener) => void
}
