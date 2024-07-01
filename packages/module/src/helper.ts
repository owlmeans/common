import { Filter, ModuleOptions, ResponseHandler } from './types.js'

export const filter = (filter: Filter, opts?: ModuleOptions): ModuleOptions => ({ filter, ...opts })

export const guard = (guard: string, opts?: ModuleOptions): ModuleOptions =>
  ({ ...opts, guards: [guard, ...(opts?.guards ?? [])] })

export const provideResponse = <T>(): ResponseHandler<T> => {
  const hanlder: ResponseHandler<T> = {
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
