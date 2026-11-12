import type { LocalAppRoute } from '../types.js'

/** One prefix of a split project's local server and the app side it reaches. */
export interface LocalRoute {
  /** `/<mount>/api`, `/<mount>`, `/api` or `/`. */
  prefix: string
  side: 'web' | 'api'
  app: LocalAppRoute
}
