import type { CommonEntrypoint } from './types.js'
import { appendContextual } from '@owlmeans/context'
import { routeAddressOf } from '@owlmeans/route/utils'
import type { CreateEntrypointSignature } from './utils/types.js'

export const entrypoint: CreateEntrypointSignature<CommonEntrypoint> = (route, opts) => {
  const ep: CommonEntrypoint = appendContextual<CommonEntrypoint>(route.route.alias, {
    _entrypoint: true,

    sticky: false,

    route,

    segment: () => ep.route.route.path,

    path: () => routeAddressOf(ep.assertCtx()).resolvePath(ep.route.route),

    mount: () => routeAddressOf(ep.assertCtx()).resolveMount(ep.route.route),

    service: () => routeAddressOf(ep.assertCtx()).resolveService(ep.route.route),

    address: () => routeAddressOf(ep.assertCtx()).resolveAddress(ep.route.route),

    isLocal: () => routeAddressOf(ep.assertCtx()).isLocalRoute(ep.route.route),

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

    /**
     * The gates standing over this entrypoint: its own, then an ancestor's for each gate service
     * this entrypoint has not already named.
     *
     * KNOWN HAZARD, deliberately left alone: the dedup is by gate SERVICE, and two gates under one
     * service are two different questions because their parameters differ — so a child that
     * declares its own gate silently drops its ancestor's, which is the opposite of what
     * "inherited" means. Anything that needs a group rule AND a member rule must therefore not
     * express the group half as a gate under the same service. Changing this would widen every
     * backend and socket entrypoint that today relies on the replacement, so it is a migration
     * rather than a fix.
     */
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
