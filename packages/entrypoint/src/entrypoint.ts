import type { CommonEntrypoint } from './types.js'
import { appendContextual } from '@owlmeans/context'
import type { CreateEntrypointSignature } from './utils/types.js'

export const entrypoint: CreateEntrypointSignature<CommonEntrypoint> = (route, opts) => {
  let guards: string[] | null = null
  let gates: [string, string[]][] | null = null
  const ep: CommonEntrypoint = appendContextual<CommonEntrypoint>(route.route.alias, {
    _entrypoint: true,
    _module: true,

    sticky: false,

    route,

    getAlias: () => ep.route.route.alias,
    getPath: () => ep.route.route.path,
    getParentAlias: () => ep.route.route.parent ?? null,
    hasParent: () => ep.getParentAlias() != null,

    resolve: async <M extends CommonEntrypoint>() => {
      if (ep.ctx == null) {
        throw new SyntaxError(`Entrypoint has no context yet - ${ep.getAlias()}`)
      }

      await ep.route.resolve(ep.ctx)

      return ep as M
    },

    getParent: () => {
      const parentAlias = ep.getParentAlias()
      if (parentAlias == null) {
        throw new SyntaxError(`Entrypoint has no parent - ${ep.getAlias()}`)
      }
      if (ep.ctx == null) {
        throw new SyntaxError(`Entrypoint has no context yet - ${ep.getAlias()}`)
      }

      return ep.ctx.entrypoint(parentAlias)
    },

    setService: service => {
      if (ep.route.route.resolved) {
        throw new SyntaxError(`Cannot update a resolved entrypoint - ${ep.getAlias()}`)
      }
      ep.route.route.service = service
    },

    getGuards: () => {
      if (guards != null) {
        return guards
      }
      guards = ep.guards ?? []

      if (ep.hasParent()) {
        guards.push(
          ...ep.getParent().getGuards().filter(guard => !guards?.includes(guard))
        )
      }

      return guards
    },

    getGates: () => {
      if (gates != null) {
        return gates
      }

      gates = ep.gate != null ? [[
        ep.gate, ep.gateParams == null
          ? [] : Array.isArray(ep.gateParams)
            ? ep.gateParams : [ep.gateParams]
      ]] : []

      if (ep.hasParent()) {
        gates.push(
          ...ep.getParent().getGates()
            .filter(([gate]) => !gates?.some(([g]) => g === gate))
        )
      }

      return gates
    },

    ...opts
  })

  return ep
}

export const parent = <T extends CommonEntrypoint | CommonEntrypoint[]>(ep: T, aliasOrParent: string, _parent?: string): T => {
  if (Array.isArray(ep)) {
    if (_parent == null) {
      throw SyntaxError('Elevating parent requires parent name to be specified')
    }
    ep = ep.find(e => e.route.route.alias === aliasOrParent) as T
    if (ep == null) {
      throw SyntaxError(`Entrypoint not found ${aliasOrParent}`)
    }
    return parent(ep, _parent)
  }
  ep.route.route.parent = aliasOrParent

  return ep
}
