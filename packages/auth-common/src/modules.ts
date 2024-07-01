
import { AUTHEN, AUTHEN_AUTHEN, AUTHEN_INIT, AllowanceRequestSchema, AuthCredentialsSchema } from '@owlmeans/auth'
import { body, filter, module, route } from '@owlmeans/module'

export const modules = [
  module(route(AUTHEN, '/authentication')),
  module(route(AUTHEN_INIT, '/init', AUTHEN), filter(body(AllowanceRequestSchema))),
  module(route(AUTHEN_AUTHEN, '/authenticate', AUTHEN), filter(body(AuthCredentialsSchema))),
]
