import type { Module, ModuleOptions } from './types.js'
import type { BasicModule } from './utils/types.js'
import { module } from './module.js'
import { isClientRouteModel } from '@owlmeans/client-route'
import type { AbstractRequest, ModuleHandler } from '@owlmeans/module'
import { normalizeHelperParams } from './utils/module.js'

export const elevate = <T, R extends AbstractRequest = AbstractRequest>(
  modules: (BasicModule | Module<T, R>)[],
  alias: string,
  handler?: ModuleHandler | ModuleOptions | boolean,
  opts?: ModuleOptions | boolean
): Module<T, R>[] => {
  [handler, opts] = normalizeHelperParams(handler, opts)
  
  const idx = modules.findIndex(({ route }) => route.route.alias === alias)
  if (idx === -1) {
    throw new SyntaxError(`Module with alias ${alias} not present`)
  }
  if (isClientRouteModel(modules[idx].route)) {
    throw new SyntaxError(`Module with alias ${alias} is elready elevated`)
  }
  modules[idx] = module(modules[idx], handler, opts)

  return modules as Module<T, R>[]
}
