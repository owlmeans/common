import type { ModuleHandler } from '@owlmeans/module'
import type { Module, ModuleOptions } from './types.js'
import type { BasicModule } from './utils/types.js'
import { module } from './module.js'
import { isServerRouteModel } from '@owlmeans/server-route'

export const elevate = <R>(
  modules: (BasicModule | Module<R>)[],
  alias: string,
  handler?: ModuleHandler | null,
  opts?: boolean | ModuleOptions<R>
): Module<R>[] => {
  const idx = modules.findIndex(({ route }) => route.route.alias === alias)
  if (idx === -1) {
    throw new SyntaxError(`Module with alias ${alias} not present`)
  }
  if (isServerRouteModel(modules[idx].route)) {
    throw new SyntaxError(`Module with alias ${alias} is elready elevated`)
  }
  modules[idx] = module(
    modules[idx], handler as ModuleHandler,
    handler == null ? { ...(typeof opts === 'boolean' ? {} : opts), intermediate: true } :
      typeof opts === 'boolean' ? { intermediate: opts } : opts
  )

  return modules as Module<R>[]
}
