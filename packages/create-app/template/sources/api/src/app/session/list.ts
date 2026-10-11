import { handlers } from '@owlmeans/server-app'
import { session } from '__APP_SLUG__-common'
import { makeSessionModel } from '../../models/session.js'
import type { Context } from '../../types.js'

const handle = handlers<Context>()

export const list = handle.params(session.list, async (params, context) =>
  await makeSessionModel(context, params.sid).list())
