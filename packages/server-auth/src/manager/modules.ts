
import { AUTHEN, AUTHEN_AUTHEN, AUTHEN_INIT, MOD_RECAPTCHA } from '@owlmeans/auth'
import { modules as list } from '@owlmeans/auth-common'
import { modules as apiConfig } from '@owlmeans/api-config-server'
import { elevate } from '@owlmeans/server-module'
import { authenticate, authenticationInit } from './actions/manager'
import { module } from '@owlmeans/client-module'
import { backend, route, RouteMethod } from '@owlmeans/route'


elevate(list, AUTHEN)
elevate(list, AUTHEN_INIT, authenticationInit)
elevate(list, AUTHEN_AUTHEN, authenticate)

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
