
import { AUTHEN, AUTHEN_AUTHEN, AUTHEN_INIT, CAUTHEN, CAUTHEN_AUTHEN, CAUTHEN_AUTHEN_DEFAULT, CAUTHEN_AUTHEN_TYPED, DISPATCHER } from '@owlmeans/auth'
import { modules as list } from '@owlmeans/auth-common'
import { handler } from '@owlmeans/client'
import { elevate, stab } from '@owlmeans/client-module'
import { AuthenticationHOC } from './components/authentication/component.js'

elevate(list, AUTHEN)
elevate(list, AUTHEN_INIT, true)
elevate(list, AUTHEN_AUTHEN, true)
elevate(list, CAUTHEN)
elevate(list, CAUTHEN_AUTHEN)
elevate(list, CAUTHEN_AUTHEN_DEFAULT, handler(AuthenticationHOC()))
elevate(list, CAUTHEN_AUTHEN_TYPED, handler(AuthenticationHOC()))
elevate(list, DISPATCHER, stab, { force: true })

export const modules = list
