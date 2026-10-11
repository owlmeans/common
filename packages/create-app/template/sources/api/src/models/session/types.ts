import type { SessionItem } from '__APP_SLUG__-common'

/**
 * The items of ONE browser session. The session id is bound when the model is built, so no
 * member can reach another session's items; the member names are the session endpoints' keys.
 */
export interface SessionModel {
  /** This session's items, newest first. */
  list: () => Promise<SessionItem[]>
  /** Store a new item under this session. */
  add: (text: string) => Promise<SessionItem>
  /** Remove an item — only when it belongs to this session. */
  remove: (id: string) => Promise<{ removed: boolean }>
}
