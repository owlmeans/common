import { route } from '@owlmeans/route'
import { Filter, CommonEntrypointOptions, AbstractResponse, CommonEntrypoint } from './types.js'
import { entrypoint } from './entrypoint.js'

export const filter = (filter: Filter, opts?: CommonEntrypointOptions): CommonEntrypointOptions => ({ filter, ...opts })

export const guard = (guard: string, opts?: CommonEntrypointOptions): CommonEntrypointOptions =>
  ({ ...opts, guards: [...new Set([guard, ...(opts?.guards ?? [])])] })

export const gate = (gate: string, params: string | string[], opts?: CommonEntrypointOptions): CommonEntrypointOptions =>
  ({ ...opts, gate, gateParams: params })

export const provideResponse = <T>(originalResponse?: unknown): AbstractResponse<T> => {
  const handler: AbstractResponse<T> = {
    responseProvider: originalResponse,

    resolve: (value, outcome) => {
      handler.value = value
      handler.outcome = outcome
    },

    reject: (error) => {
      handler.error = error
    }
  }

  return handler
}

export const clone = <M extends CommonEntrypoint>(entrypoints: M[], from: string, to: string, service: string) => {
  const source = entrypoints.find(e => e.alias === from)

  if (source?.route.route != null) {
    const _route = { ...source.route.route, service, resolved: false, alias: to }
    entrypoints.push(entrypoint(route(to, _route.path, _route)) as M)
  }
}
