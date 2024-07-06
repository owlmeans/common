
import { AUTHEN, AUTHEN_AUTHEN, AUTHEN_INIT, CAUTHEN, CAUTHEN_AUTHEN, DISPATCHER } from '@owlmeans/auth'
import { modules as list } from '@owlmeans/auth-common'
import { handler } from '@owlmeans/client'
import { elevate, stab } from '@owlmeans/client-module'
import { AuthenticationHOC } from './components/authentication/component.js'

elevate(list, AUTHEN)
elevate(list, AUTHEN_INIT, true)
elevate(list, AUTHEN_AUTHEN, true)
elevate(list, CAUTHEN)
elevate(list, CAUTHEN_AUTHEN, handler(AuthenticationHOC()))
elevate(list, DISPATCHER, stab, { force: true })

export const modules = list
