import { handleParams } from '@owlmeans/server-app'
import type { SessionItem, SessionParams } from '__APP_SLUG__-common'
import { SESSION_ITEMS } from '../../consts.js'
import type { Context } from '../../types.js'

export const list = handleParams<SessionParams>(async (params, context) => {
  const ctx = context as Context
  const resource = ctx.getStaticResource<SessionItem>(SESSION_ITEMS)

  // The static resource lists every record; filter to this session and sort newest first.
  const { items } = await resource.list<SessionItem>()
  return items
    .filter(item => item.sessionId === params.sid)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
})
