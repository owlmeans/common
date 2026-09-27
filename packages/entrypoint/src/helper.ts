import { Filter, CommonEntrypointOptions, AbstractResponse } from './types.js'

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
