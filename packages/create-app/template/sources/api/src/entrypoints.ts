import { entrypoints } from '@owlmeans/server-app'
import { bind } from '@owlmeans/server-entrypoint'
import { appProtocols } from '__APP_SLUG__-common'
import * as handlers from './app/session/index.js'

/** Local server bindings for the shared session protocol tree. */
export const appBindings = [
  ...entrypoints,
  bind(appProtocols.api.session.base),
  bind(appProtocols.api.session.list, handlers.list),
  bind(appProtocols.api.session.add, handlers.add),
  bind(appProtocols.api.session.remove, handlers.remove),
]
