import { Filter, CommonModuleOptions, AbstractResponse } from './types.js'

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
