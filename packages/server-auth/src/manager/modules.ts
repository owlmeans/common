
import { AUTHEN, AUTHEN_AUTHEN, AUTHEN_INIT, AUTHEN_RELY, MOD_RECAPTCHA } from '@owlmeans/auth'
import { modules as list } from '@owlmeans/auth-common'
import { modules as apiConfig } from '@owlmeans/api-config-server'
import { elevate, guard } from '@owlmeans/server-module'
import * as actions from './actions/index.js'
import { module } from '@owlmeans/client-module'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { handleIntermediate } from '@owlmeans/server-api'
import { DEFAULT_RELY } from './consts.js'

elevate(list, AUTHEN, handleIntermediate(
  async (_, context) => await context.updateContext() as typeof context
), { intermediate: true })
elevate(list, AUTHEN_INIT, actions.authenticationInit)
elevate(list, AUTHEN_AUTHEN, actions.authenticate)
elevate(list, AUTHEN_RELY, actions.rely, guard(DEFAULT_RELY))

export const modules = list
list.push(...apiConfig)
list.push(
  module(
    route(MOD_RECAPTCHA, '/api/siteverify', backend({
      host: 'https://www.google.com',
      base: 'recaptcha',
    }, RouteMethod.POST))
  )
)
