import { authProtocols } from '@owlmeans/auth-common'
import { entrypoints as apiConfigBindings } from '@owlmeans/api-config-server'
import { bind } from '@owlmeans/server-entrypoint'
import { decorateEntrypoint } from '@owlmeans/entrypoint'
import * as actions from './actions/index.js'
import { DEFAULT_RELY } from './consts.js'

const relyProtocol = decorateEntrypoint(authProtocols.rely, { guards: DEFAULT_RELY })

/** Server entrypoints for the full authentication manager. */
export const entrypoints = [
  bind(authProtocols.authen, undefined, { intermediate: true }),
  bind(authProtocols.init, actions.authenticationInit(authProtocols.init)),
  bind(authProtocols.authenticate, actions.authenticate(authProtocols.authenticate)),
  bind(relyProtocol, actions.rely(relyProtocol)),
  ...apiConfigBindings,
]
