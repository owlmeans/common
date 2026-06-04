import type { ClientEntrypoint, ClientEntrypointOptions, RefedEntrypointHandler } from './types.js'
import { entrypoint } from './entrypoint.js'
import { isClientRouteModel } from '@owlmeans/client-route'
import type { AbstractRequest, CommonEntrypoint } from '@owlmeans/entrypoint'
import { normalizeHelperParams } from './utils/entrypoint.js'
import type { JSONSchemaType } from "ajv"

export const elevate = <T = {}, R extends AbstractRequest = AbstractRequest>(
  entrypoints: (CommonEntrypoint | ClientEntrypoint<T, R>)[],
  alias: string,
  handler?: RefedEntrypointHandler<T, R> | ClientEntrypointOptions | boolean,
  opts?: ClientEntrypointOptions | boolean
): ClientEntrypoint<T, R>[] => {
  [handler, opts] = normalizeHelperParams(handler, opts)

  const idx = entrypoints.findIndex(({ route }) => route.route.alias === alias)
  if (idx === -1) {
    throw new SyntaxError(`Entrypoint with alias ${alias} not present`)
  }
  if (isClientRouteModel(entrypoints[idx].route) && opts?.force !== true) {
    throw new SyntaxError(`Entrypoint with alias ${alias} is already elevated`)
  }

  entrypoints[idx] = entrypoint(entrypoints[idx], handler, opts)

  return entrypoints as ClientEntrypoint<T, R>[]
}

export const stab: RefedEntrypointHandler<{}> = () => () => {
  return void 0 as any
}

export const provideRequest = <T extends {} = {}>(alias: string, path: string): AbstractRequest<T> => {
  const request = {
    alias,
    params: {},
    headers: {},
    query: {},
    path,
    canceled: false,
    cancel: () => request.canceled = true
  }

  return request
}

export const pickPerSchema = <T, R>(object: T, schema: JSONSchemaType<R>): Partial<R> =>
  Object.keys(schema.properties).reduce(
    (acc, key) => {
      if (object[key as keyof T] != null) {
        acc[key as keyof R] = object[key as keyof T] as unknown as R[keyof R]
      }
      return acc
    }, {} as Partial<R>
  )
