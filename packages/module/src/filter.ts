import type { JSONSchemaType } from 'ajv'
import type { Filter } from './types.js'

export const body = <T>(schema: JSONSchemaType<T>, filter?: Filter): Filter => {
  return { ...filter, body: schema as any }
}

export const query = <T>(schema: JSONSchemaType<T>, filter?: Filter): Filter => {
  return { ...filter, query: schema as any }
}

export const params = <T>(schema: JSONSchemaType<T>, filter?: Filter): Filter => {
  return { ...filter, params: schema as any }
}

export const response = <T>(schema: JSONSchemaType<T>, code?: number, filter?: Filter): Filter => {
  let _schema: any = schema
  if (filter?.response != null && code != null) {
    _schema = { ...filter.response, [code]: schema }
  }
  return { ...filter, response: _schema }
}

export const headers = <T>(schema: JSONSchemaType<T>, filter?: Filter): Filter => {
  return { ...filter, headers: schema as any }
}
