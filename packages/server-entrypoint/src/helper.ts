import type { ServerEntrypoint, EntrypointOptions, RefedEntrypointHandler } from './types.js'
import { entrypoint } from './entrypoint.js'
import { isServerRouteModel } from '@owlmeans/server-route'
import { createBasicGuard } from './utils/helper.js'
import type { CommonEntrypoint } from '@owlmeans/entrypoint'

export const elevate = <R>(
  entrypoints: (CommonEntrypoint | ServerEntrypoint<R>)[],
  alias: string,
  handler?: RefedEntrypointHandler<R> | boolean | EntrypointOptions<R>,
  opts?: boolean | EntrypointOptions<R>
): ServerEntrypoint<R>[] => {
  const idx = entrypoints.findIndex(({ route }) => route.route.alias === alias)
  if (idx === -1) {
    throw new SyntaxError(`Entrypoint with alias ${alias} not present`)
  }
  if (typeof handler === 'boolean') {
    opts = handler
    handler = undefined
  }
  if (typeof handler === 'object' && typeof handler !== 'function') {
    opts = handler
    handler = undefined
  }
  const force = typeof opts === 'object' && opts.force
  if (isServerRouteModel(entrypoints[idx].route) && !force) {
    throw new SyntaxError(`Entrypoint with alias ${alias} is already elevated`)
  }

  entrypoints[idx] = entrypoint(
    entrypoints[idx], handler, typeof opts === 'boolean' ? { intermediate: opts } : opts
  )

  return entrypoints as ServerEntrypoint<R>[]
}

export const guard = <R>(guard: string, opts?: EntrypointOptions<R>): EntrypointOptions<R> =>
  ({ ...createBasicGuard(guard, opts) })
