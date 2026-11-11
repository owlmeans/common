import type { BotPlatformDescriptor } from '@owlmeans/bot'

/** One surface's platform read, kept for every hook over it. */
export interface BotPlatformRead {
  load: () => Promise<BotPlatformDescriptor[]>
}

/**
 * The registered platforms per surface (by base alias), read once and shared: they are the
 * deployment's — the same for every scope and every screen until the server restarts — so the
 * connections panel, each row and the activity panel all read the one answer.
 */
export interface BotPlatformCacheUtils {
  /** The answer already in hand for a surface, or undefined before its first read settled. */
  peek: (alias: string) => BotPlatformDescriptor[] | undefined
  /**
   * The surface's descriptors: the read in flight or settled, else `read.load()` once. A failed read
   * is not kept — the next call reads again.
   */
  read: (alias: string, read: BotPlatformRead) => Promise<BotPlatformDescriptor[]>
  /** Forget a surface's answer, so the next read asks the server. */
  forget: (alias: string) => void
}
