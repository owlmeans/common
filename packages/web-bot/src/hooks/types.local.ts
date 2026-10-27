import type { BotSyncTopic } from '../utils/sync/types.js'
import type { BotSurface } from '../types.js'

export interface BotCollectionOptions<T> {
  surface: BotSurface
  /** What other hooks over the same surface are told when this one changes something. */
  topic: BotSyncTopic
  /** What the read depends on (`connection`, `limit`); a new key reads again, visibly. */
  key: string
  /** The read itself. Kept in a ref: a fresh closure per render never re-reads by itself. */
  load: () => Promise<T[]>
  /** Read again every so many milliseconds while the page is visible; `0` or absent: never. */
  refreshMs?: number
}

export interface BotCollection<T extends { id: string }> {
  items: T[]
  loading: boolean
  error: Error | null
  reload: () => Promise<void>
  /** Put a record the server answered with in place (or at the end), without a read. */
  upsert: (item: T) => void
  /** Take a removed record out, without a read. */
  drop: (id: string) => void
  /** Tell the other hooks over this surface that these topics changed. */
  publish: (...topics: BotSyncTopic[]) => void
}
