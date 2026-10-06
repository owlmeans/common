import { handlers } from '@owlmeans/server-app'
import { session } from '__APP_SLUG__-common'
import { makeSessionModel } from '../../models/session.js'
import type { Context } from '../../types.js'

const handle = handlers<Context>()

export const remove = handle.params(session.remove, async (params, context) =>
  await makeSessionModel(context, params.sid).remove(params.id))
