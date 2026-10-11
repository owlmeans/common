import { randomUUID } from 'node:crypto'
import type { SessionItem } from '__APP_SLUG__-common'
import { SESSION_ITEMS } from '../consts.js'
import type { Context } from '../types.js'
import type { SessionModel } from './session/types.js'

/**
 * The session domain, bound to the context that holds its resource and to the session it serves.
 * Built where it is used — `makeSessionModel(context, sid).list()` — never stored.
 */
export const makeSessionModel = (context: Context, sid: string): SessionModel => {
  const resource = context.getStaticResource<SessionItem>(SESSION_ITEMS)

  const list: SessionModel['list'] = async () => {
    // The resource answers the whole question — this session's items, newest first.
    const { items } = await resource.list(
      { sessionId: sid },
      { sort: [{ field: 'createdAt', order: 'desc' }] }
    )

    return items
  }

  const add: SessionModel['add'] = async text => await resource.create({
    id: randomUUID(),
    sessionId: sid,
    text,
    createdAt: new Date().toISOString(),
  })

  const remove: SessionModel['remove'] = async id => {
    const existing = await resource.load(id)
    // Only remove the item if it belongs to this session.
    if (existing == null || existing.sessionId !== sid) {
      return { removed: false }
    }

    await resource.delete(id)
    return { removed: true }
  }

  return { list, add, remove }
}
