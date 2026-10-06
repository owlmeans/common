import type { JSONSchemaType } from 'ajv'
import type { Filter } from '../types.js'

/** Builds the request/response schema filter of an entrypoint, one section at a time. */
export interface FilterHelper {
  /** `filter` with its body schema set. */
  body: <T>(schema: JSONSchemaType<T>, filter?: Filter) => Filter
  /** `filter` with its query schema set. */
  query: <T>(schema: JSONSchemaType<T>, filter?: Filter) => Filter
  /** `filter` with its params schema set. */
  params: <T>(schema: JSONSchemaType<T>, filter?: Filter) => Filter
  /** `filter` with its response schema set — keyed by `code` when the filter already has responses. */
  response: <T>(schema: JSONSchemaType<T>, code?: number, filter?: Filter) => Filter
  /** `filter` with its headers schema set. */
  headers: <T>(schema: JSONSchemaType<T>, filter?: Filter) => Filter
}
