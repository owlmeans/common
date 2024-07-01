
import { AUTHEN, AUTHEN_AUTHEN, AUTHEN_INIT } from '@owlmeans/auth'
import { modules as list } from '@owlmeans/auth-common'
import { elevate } from '@owlmeans/server-module'
import { authenticate, authenticationInit } from './actions/manager'

elevate(list, AUTHEN)
elevate(list, AUTHEN_INIT, authenticationInit)
elevate(list, AUTHEN_AUTHEN, authenticate)

export const modules = list
