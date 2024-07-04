
import { AUTHEN, AUTHEN_AUTHEN, AUTHEN_INIT, AllowanceRequestSchema, AuthCredentialsSchema, CAUTHEN, CAUTHEN_AUTHEN } from '@owlmeans/auth'
import { body, filter, module, route } from '@owlmeans/module'
import { RouteMethod, frontend } from '@owlmeans/route'

export const modules = [
  module(route(AUTHEN, '/authentication')),
  module(route(AUTHEN_INIT, '/init', { parent: AUTHEN, method: RouteMethod.POST }), filter(body(AllowanceRequestSchema))),
  module(route(AUTHEN_AUTHEN, '/authenticate', { parent: AUTHEN, method: RouteMethod.POST }), filter(body(AuthCredentialsSchema))),
  module(route(CAUTHEN, '/authentication', frontend())),
  module(route(CAUTHEN_AUTHEN, '/login', frontend(CAUTHEN)))
]
