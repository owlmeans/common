import type { ServerModule, ModuleOptions, RefedModuleHandler } from './types.js'
import { module } from './module.js'
import { isServerRouteModel } from '@owlmeans/server-route'
import { createBasicGuard } from './utils/helper.js'
import type { CommonModule } from '@owlmeans/module'

export const elevate = <R>(
  modules: (CommonModule | ServerModule<R>)[],
  alias: string,
  handler?: RefedModuleHandler<R> | boolean | ModuleOptions<R>,
  opts?: boolean | ModuleOptions<R>
): ServerModule<R>[] => {
  const idx = modules.findIndex(({ route }) => route.route.alias === alias)
  if (idx === -1) {
    throw new SyntaxError(`Module with alias ${alias} not present`)
  }
  if (isServerRouteModel(modules[idx].route)) {
    throw new SyntaxError(`Module with alias ${alias} is elready elevated`)
  }

  if (typeof handler === 'boolean') {
    opts = handler
    handler = undefined
  }
  if (typeof handler === 'object' && typeof handler !== 'function') {
    opts = handler
    handler = undefined
  }

  modules[idx] = module(
    modules[idx], handler, typeof opts === 'boolean' ? { intermediate: opts } : opts
  )

  return modules as ServerModule<R>[]
}

export const guard = <R>(guard: string, opts?: ModuleOptions<R>): ModuleOptions<R> =>
  ({ ...createBasicGuard(guard, opts) })
