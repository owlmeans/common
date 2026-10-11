import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { JSONSchemaType } from "ajv"
import type { ClientRequestHelper } from './helper/types.js'

export const createClientRequestHelper = (): ClientRequestHelper => {
  const provideRequest = <T extends {} = {}>(alias: string, path: string): AbstractRequest<T> => {
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

  const pickPerSchema = <T, R>(object: T, schema: JSONSchemaType<R>): Partial<R> =>
    Object.keys(schema.properties).reduce(
      (acc, key) => {
        if (object[key as keyof T] != null) {
          acc[key as keyof R] = object[key as keyof T] as unknown as R[keyof R]
        }
        return acc
      }, {} as Partial<R>
    )

  return { provideRequest, pickPerSchema }
}

export const clientRequestHelper = createClientRequestHelper()

/** @deprecated compat:factory-refactor — use `clientRequestHelper.provideRequest(…)` */
export const provideRequest = <T extends {} = {}>(alias: string, path: string): AbstractRequest<T> => clientRequestHelper.provideRequest<T>(alias, path)
