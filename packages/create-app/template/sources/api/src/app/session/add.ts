import { handlers } from '@owlmeans/server-app'
import { session } from '__APP_SLUG__-common'
import { makeSessionModel } from '../../models/session.js'
import type { Context } from '../../types.js'

const handle = handlers<Context>()

export const add = handle.body(session.add, async (payload, context, request) =>
  await makeSessionModel(context, request.params.sid).add(payload.text))
