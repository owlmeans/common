import { entrypoints } from '@owlmeans/server-app'
import { bind } from '@owlmeans/server-entrypoint'
import { appEntrypoints as protocols } from '__APP_SLUG__-common'
import * as handlers from './app/session/index.js'

/** Local server bindings for the shared session protocol tree. */
export const appEntrypoints = [
  ...entrypoints,
  bind(protocols.api.session.base),
  bind(protocols.api.session.list, handlers.list),
  bind(protocols.api.session.add, handlers.add),
  bind(protocols.api.session.remove, handlers.remove),
]
