import type { JSONSchemaType, AnySchemaObject } from 'ajv'
import type { EntrypointSchema, OpenValue, RequestShape, Typed } from './types.js'

export interface TypeToken {
  readonly kind: 'entrypoint-type'
  readonly schema?: AnySchemaObject
}

export declare const entrypointSchemaType: unique symbol

export type AnyShapeSource = AnySchemaObject | TypeToken

export type SourceValue<Source> =
  Source extends Typed<infer Value> ? Value
    : Source extends EntrypointSchema<infer Value> ? Value
      : Source extends JSONSchemaType<infer Value>
        ? Value extends OpenValue ? Value : OpenValue
        : OpenValue

export type UrlRequest<Request extends RequestShape> =
  (Request extends { params: infer Params } ? { params: Params }
    : Request extends { params?: infer Params } ? { params?: Params } : {})
  & (Request extends { query: infer Query } ? { query: Query }
    : Request extends { query?: infer Query } ? { query?: Query } : {})
