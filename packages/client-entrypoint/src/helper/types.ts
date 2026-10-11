import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { JSONSchemaType } from 'ajv'

/** Builds and shapes the requests a client sends. */
export interface ClientRequestHelper {
  /** A minimal cancellable `AbstractRequest` for an entrypoint alias at a path. */
  provideRequest: <T extends {} = {}>(alias: string, path: string) => AbstractRequest<T>
  /** Keeps only the non-null keys of `object` the AJV schema declares. */
  pickPerSchema: <T, R>(object: T, schema: JSONSchemaType<R>) => Partial<R>
}
