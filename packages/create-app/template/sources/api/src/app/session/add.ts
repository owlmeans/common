import { randomUUID } from 'node:crypto'
import { handleBody } from '@owlmeans/server-app'
import type { AddItemPayload, SessionItem, SessionParams } from '__APP_SLUG__-common'
import { SESSION_ITEMS } from '../../consts.js'
import type { Context } from '../../types.js'

export const add = handleBody<AddItemPayload>(async (payload, context, req) => {
  const ctx = context as Context
  const { sid } = req.params as SessionParams
  const resource = ctx.getStaticResource<SessionItem>(SESSION_ITEMS)

  const item: SessionItem = {
    id: randomUUID(),
    sessionId: sid,
    text: payload.text,
    createdAt: new Date().toISOString(),
  }

  return await resource.create(item)
})
