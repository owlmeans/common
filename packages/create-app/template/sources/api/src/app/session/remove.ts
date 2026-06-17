import { handleParams } from '@owlmeans/server-app'
import type { ItemParams, SessionItem } from '__APP_SLUG__-common'
import { SESSION_ITEMS } from '../../consts.js'
import type { Context } from '../../types.js'

export const remove = handleParams<ItemParams>(async (params, context) => {
  const ctx = context as Context
  const resource = ctx.getStaticResource<SessionItem>(SESSION_ITEMS)

  const existing = await resource.load<SessionItem>(params.id)
  // Only remove the item if it belongs to the requesting session.
  if (existing == null || existing.sessionId !== params.sid) {
    return { removed: false }
  }

  await resource.delete(params.id)
  return { removed: true }
})
