import { route } from '@owlmeans/route'
import { Filter, CommonModuleOptions, AbstractResponse, CommonModule } from './types.js'
import { module } from './module.js'

export const filter = (filter: Filter, opts?: CommonModuleOptions): CommonModuleOptions => ({ filter, ...opts })

export const guard = (guard: string, opts?: CommonModuleOptions): CommonModuleOptions =>
  ({ ...opts, guards: [guard, ...(opts?.guards ?? [])] })

export const provideResponse = <T>(originalResponse?: unknown): AbstractResponse<T> => {
  const hanlder: AbstractResponse<T> = {
    responseProvider: originalResponse,

    resolve: (value, outcome) => {
      hanlder.value = value
      hanlder.outcome = outcome
    },

    reject: (error) => {
      hanlder.error = error
    }
  }

  return hanlder
}

export const clone = <M extends CommonModule>(modules: M[], from: string, to: string, service: string) => {
  const source = modules.find(m => m.alias === from)

  if (source?.route.route != null) {
    const _route = { ...source.route.route, service, resolved: false, alias: to }
    modules.push(module(route(to, _route.path, _route)) as M)
  }
}
