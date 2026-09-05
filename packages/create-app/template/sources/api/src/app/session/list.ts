import { handleParams } from '@owlmeans/server-app'
import type { SessionItem, SessionParams } from '__APP_SLUG__-common'
import { SESSION_ITEMS } from '../../consts.js'
import type { Context } from '../../types.js'

export const list = handleParams<SessionParams>(async (params, context) => {
  const ctx = context as Context
  const resource = ctx.getStaticResource<SessionItem>(SESSION_ITEMS)

  // The resource answers the whole question — this session's items, newest first.
  const { items } = await resource.list(
    { sessionId: params.sid },
    { sort: [{ field: 'createdAt', order: 'desc' }] }
  )

  return items
})
