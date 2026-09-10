import type {
  BoundEntrypointHandler, ServerEntrypoint, EntrypointOptions, RefedEntrypointHandler,
  ServerProtocolEntrypoint,
} from './types.js'
import { entrypoint } from './entrypoint.js'
import { bind } from './protocol.js'
import { createBasicGuard } from './utils/helper.js'
import { isEntrypointProtocol } from '@owlmeans/entrypoint'
import type { CommonEntrypoint, EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'

/**
 * Replace the entrypoint declared under `alias` with its elevated counterpart. Elevating is
 * idempotent — calling it again simply replaces the element once more, and the guards it brings
 * are added to the ones already declared.
 *
 * @throws {SyntaxError} when no entrypoint carries the alias
 */
export function elevate(
  declarations: EntrypointProtocolDeclaration[],
  implementations: readonly BoundEntrypointHandler<EntrypointProtocolDeclaration>[],
): ServerProtocolEntrypoint<EntrypointProtocolDeclaration>[]
export function elevate<R>(
  entrypoints: (CommonEntrypoint | ServerEntrypoint<R>)[],
  alias: string,
  handler?: RefedEntrypointHandler<R> | boolean | EntrypointOptions<R>,
  opts?: boolean | EntrypointOptions<R>
): ServerEntrypoint<R>[]
export function elevate(
  entrypoints: (CommonEntrypoint | EntrypointProtocolDeclaration)[],
  target: string | readonly BoundEntrypointHandler<EntrypointProtocolDeclaration>[],
  handler?: RefedEntrypointHandler | boolean | EntrypointOptions<object>,
  opts?: boolean | EntrypointOptions<object>,
): (ServerEntrypoint<object> | ServerProtocolEntrypoint<EntrypointProtocolDeclaration>)[] {
  if (typeof target !== 'string') {
    return entrypoints.map((declaration) => {
      if (!isEntrypointProtocol(declaration)) {
        throw new SyntaxError('Protocol elevation accepts protocol declarations only')
      }

      const implementation = target.find(bound => bound.protocol === declaration)
      return bind(declaration, implementation)
    })
  }

  const idx = entrypoints.findIndex((candidate) =>
    !isEntrypointProtocol(candidate) && candidate.route.route.alias === target)
  if (idx === -1) {
    throw new SyntaxError(`Entrypoint with alias ${target} not present`)
  }
  if (typeof handler === 'boolean') {
    opts = handler
    handler = undefined
  }
  if (typeof handler === 'object' && typeof handler !== 'function') {
    opts = handler
    handler = undefined
  }

  const declaration = entrypoints[idx]
  if (isEntrypointProtocol(declaration)) {
    throw new SyntaxError('String elevation accepts materialized entrypoints only')
  }

  entrypoints[idx] = entrypoint(
    declaration, handler, typeof opts === 'boolean' ? { intermediate: opts } : opts
  )

  return entrypoints as ServerEntrypoint<object>[]
}

export const guard = <R>(guard: string, opts?: EntrypointOptions<R>): EntrypointOptions<R> =>
  ({ ...createBasicGuard(guard, opts) })
