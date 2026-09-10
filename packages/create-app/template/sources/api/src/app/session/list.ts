import { handlers } from '@owlmeans/server-app'
import { session, type SessionItem } from '__APP_SLUG__-common'
import { SESSION_ITEMS } from '../../consts.js'
import type { Context } from '../../types.js'

const handle = handlers<Context>()

export const list = handle.params(session.list, async (params, context) => {
  const resource = context.getStaticResource<SessionItem>(SESSION_ITEMS)

  // The resource answers the whole question — this session's items, newest first.
  const { items } = await resource.list(
    { sessionId: params.sid },
    { sort: [{ field: 'createdAt', order: 'desc' }] }
  )

  return items
})
