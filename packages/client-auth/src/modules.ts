
import { AUTHEN, AUTHEN_AUTHEN, AUTHEN_INIT, CAUTHEN, CAUTHEN_AUTHEN } from '@owlmeans/auth'
import { modules as list } from '@owlmeans/auth-common'
import { handler } from '@owlmeans/client'
import { elevate } from '@owlmeans/client-module'
import { AuthenticationHOC } from './components/authentication/component.js'

elevate(list, AUTHEN)
elevate(list, AUTHEN_INIT, true)
elevate(list, AUTHEN_AUTHEN, true)
elevate(list, CAUTHEN)
elevate(list, CAUTHEN_AUTHEN, handler(AuthenticationHOC()))

export const modules = list
