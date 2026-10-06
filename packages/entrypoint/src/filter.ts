import type { JSONSchemaType } from 'ajv'
import type { Filter } from './types.js'
import type { FilterHelper } from './filter/types.js'

export const createFilterHelper = (): FilterHelper => {
  const body = <T>(schema: JSONSchemaType<T>, filter?: Filter): Filter => {
    return { ...filter, body: schema as any }
  }

  const query = <T>(schema: JSONSchemaType<T>, filter?: Filter): Filter => {
    return { ...filter, query: schema as any }
  }

  const params = <T>(schema: JSONSchemaType<T>, filter?: Filter): Filter => {
    return { ...filter, params: schema as any }
  }

  const response = <T>(schema: JSONSchemaType<T>, code?: number, filter?: Filter): Filter => {
    let _schema: any = schema
    if (filter?.response != null && code != null) {
      _schema = { ...filter.response, [code]: schema }
    }
    return { ...filter, response: _schema }
  }

  const headers = <T>(schema: JSONSchemaType<T>, filter?: Filter): Filter => {
    return { ...filter, headers: schema as any }
  }

  return { body, query, params, response, headers }
}

export const filterHelper = createFilterHelper()
