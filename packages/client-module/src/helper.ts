import type { ClientModule, ClientModuleOptions, RefedModuleHandler } from './types.js'
import { module } from './module.js'
import { isClientRouteModel } from '@owlmeans/client-route'
import type { AbstractRequest, CommonModule } from '@owlmeans/module'
import { normalizeHelperParams } from './utils/module.js'

export const elevate = <T = {}, R extends AbstractRequest = AbstractRequest>(
  modules: (CommonModule | ClientModule<T, R>)[],
  alias: string,
  handler?: RefedModuleHandler<T, R> | ClientModuleOptions | boolean,
  opts?: ClientModuleOptions | boolean
): ClientModule<T, R>[] => {
  [handler, opts] = normalizeHelperParams(handler, opts)

  const idx = modules.findIndex(({ route }) => route.route.alias === alias)
  if (idx === -1) {
    throw new SyntaxError(`Module with alias ${alias} not present`)
  }
  if (isClientRouteModel(modules[idx].route) && opts?.force !== true) {
    throw new SyntaxError(`Module with alias ${alias} is elready elevated`)
  }
  
  modules[idx] = module(modules[idx], handler, opts)
  
  return modules as ClientModule<T, R>[]
}

export const stab: RefedModuleHandler<{}> = () => () => {
  return void 0 as any
}

export const provideRequest = <T extends {} = {}>(alias: string, path: string): AbstractRequest<T> => {
  const request = {
    alias,
    params: {},
    headers: {},
    query: {},
    path,
    canceled: false,
    cancel: () => request.canceled = true
  }

  return request
}
