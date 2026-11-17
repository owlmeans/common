import type { LlmFetchObserver, LlmStreamResume } from '../../plugins/types.js'

/** What a stream under deadline hears from its attempt's traffic. */
export interface ObserverListener {
  /** A request left through the attempt's client. */
  fetched: () => void
  /** Bytes arrived in one of its response bodies. */
  received: () => void
}

/** One attempt's traffic observer: the half a plugin is handed, plus the model's own controls. */
export interface AttemptObserver extends LlmFetchObserver {
  /** Whether a request left through {@link LlmFetchObserver.wrap} while the observer was armed. */
  fetched: () => boolean
  /** Hear the attempt's traffic; replaces any earlier listener. */
  listen: (listener: ObserverListener) => void
  /** Stop hearing it for good — later requests, bytes and resumes are not reported. Idempotent. */
  disarm: () => void
}

/** Per-attempt traffic observers. Library-private. */
export interface ObserverUtils {
  /** A fresh, armed observer for one attempt; `onResume` hears every resume while it is armed. */
  of: (onResume?: (event: LlmStreamResume) => void) => AttemptObserver
}
