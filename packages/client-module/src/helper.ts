import type { Module, ModuleOptions } from './types.js'
import type { BasicModule } from './utils/types.js'
import { module } from './module.js'
import { isClientRouteModel } from '@owlmeans/client-route'
import type { AbstractRequest } from '@owlmeans/module'

export const elevate = <T, R extends AbstractRequest = AbstractRequest>(
  modules: (BasicModule | Module<T, R>)[],
  alias: string,
  opts?: ModuleOptions
): Module<T, R>[] => {
  const idx = modules.findIndex(({ route }) => route.route.alias === alias)
  if (idx === -1) {
    throw new SyntaxError(`Module with alias ${alias} not present`)
  }
  if (isClientRouteModel(modules[idx].route)) {
    throw new SyntaxError(`Module with alias ${alias} is elready elevated`)
  }
  modules[idx] = module(modules[idx], opts)

  return modules as Module<T, R>[]
}
