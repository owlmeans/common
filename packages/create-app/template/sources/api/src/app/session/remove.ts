import { handlers } from '@owlmeans/server-app'
import { session, type SessionItem } from '__APP_SLUG__-common'
import { SESSION_ITEMS } from '../../consts.js'
import type { Context } from '../../types.js'

const handle = handlers<Context>()

export const remove = handle.params(session.remove, async (params, context) => {
  const resource = context.getStaticResource<SessionItem>(SESSION_ITEMS)

  const existing = await resource.load(params.id)
  // Only remove the item if it belongs to the requesting session.
  if (existing == null || existing.sessionId !== params.sid) {
    return { removed: false }
  }

  await resource.delete(params.id)
  return { removed: true }
})
