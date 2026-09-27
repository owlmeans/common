import { randomUUID } from 'node:crypto'
import { handlers } from '@owlmeans/server-app'
import { session, type SessionItem } from '__APP_SLUG__-common'
import { SESSION_ITEMS } from '../../consts.js'
import type { Context } from '../../types.js'

const handle = handlers<Context>()

export const add = handle.body(session.add, async (payload, context, request) => {
  const { sid } = request.params
  const resource = context.getStaticResource<SessionItem>(SESSION_ITEMS)

  const item: SessionItem = {
    id: randomUUID(),
    sessionId: sid,
    text: payload.text,
    createdAt: new Date().toISOString(),
  }

  return await resource.create(item)
})
