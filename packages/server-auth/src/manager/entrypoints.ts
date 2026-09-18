
import { MOD_RECAPTCHA } from '@owlmeans/auth'
import { authProtocols } from '@owlmeans/auth-common'
import { entrypoints as apiConfigBindings } from '@owlmeans/api-config-server'
import { bind } from '@owlmeans/server-entrypoint'
import { decorateEntrypoint, openProtocol } from '@owlmeans/entrypoint'
import * as actions from './actions/index.js'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { DEFAULT_RELY } from './consts.js'

const relyProtocol = decorateEntrypoint(authProtocols.rely, { guards: DEFAULT_RELY })
const reCaptchaProtocol = openProtocol(route(MOD_RECAPTCHA, '/api/siteverify', backend({
  host: 'https://www.google.com',
  base: 'recaptcha',
  secure: true,
}, RouteMethod.POST)))

/** Server entrypoints for the full authentication manager. */
export const entrypoints = [
  bind(authProtocols.authen, undefined, { intermediate: true }),
  bind(authProtocols.init, actions.authenticationInit(authProtocols.init)),
  bind(authProtocols.authenticate, actions.authenticate(authProtocols.authenticate)),
  bind(relyProtocol, actions.rely(relyProtocol)),
  ...apiConfigBindings,
  bind(reCaptchaProtocol),
]
