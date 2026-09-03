import type { CommonEntrypoint } from './types.js'
import { appendContextual } from '@owlmeans/context'
import {
  isLocalRoute, resolveAddress, resolveMount, resolvePath, resolveService
} from '@owlmeans/route/utils'
import type { CreateEntrypointSignature } from './utils/types.js'

export const entrypoint: CreateEntrypointSignature<CommonEntrypoint> = (route, opts) => {
  const ep: CommonEntrypoint = appendContextual<CommonEntrypoint>(route.route.alias, {
    _entrypoint: true,

    sticky: false,

    route,

    segment: () => ep.route.route.path,

    path: () => resolvePath(ep.assertCtx(), ep.route.route),

    mount: () => resolveMount(ep.assertCtx(), ep.route.route),

    service: () => resolveService(ep.assertCtx(), ep.route.route),

    address: () => resolveAddress(ep.assertCtx(), ep.route.route),

    isLocal: () => isLocalRoute(ep.assertCtx(), ep.route.route),

    parent: () => ep.route.route.parent == null ? null
      : ep.assertCtx().entrypoint<CommonEntrypoint>(ep.route.route.parent),

    // Walked afresh on every call: a guard attached to an ancestor after this entrypoint was first
    // asked still has to count.
    getGuards: () => {
      const guards = [...ep.guards ?? []]
      const parent = ep.parent()
      if (parent != null) {
        guards.push(...parent.getGuards().filter(guard => !guards.includes(guard)))
      }

      return guards
    },

    getGates: () => {
      const gates: [string, string[]][] = ep.gate != null ? [[
        ep.gate, ep.gateParams == null
          ? [] : Array.isArray(ep.gateParams)
            ? ep.gateParams : [ep.gateParams]
      ]] : []

      const parent = ep.parent()
      if (parent != null) {
        gates.push(...parent.getGates().filter(([gate]) => !gates.some(([g]) => g === gate)))
      }

      return gates
    },

    ...opts
  })

  return ep
}
