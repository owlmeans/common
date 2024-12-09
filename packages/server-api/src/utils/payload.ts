import { ModuleOutcome } from '@owlmeans/module'
import type { AbstractResponse, AbstractRequest } from '@owlmeans/module'
import type { Request, Response } from '../types.js'
import { ACCEPTED, CREATED, OK, SERVER_ERROR } from '@owlmeans/api'
import type { AnySchemaObject } from 'ajv'

export const provideRequest = (alias: string, req: Request, provision?: boolean): AbstractRequest => {
  provision = provision ?? false
  return {
    alias,
    auth: (req as any)._auth ?? undefined,
    params: req.params as Record<string, string | number | undefined | null>,
    body: req.body as Record<string, any>,
    headers: req.headers,
    query: req.query as Record<string, string | number | undefined | null>,
    path: req.url,
    original: provision ? req : undefined
  }
}

/**
 * @throws {Error} 
 */
export const executeResponse = <T>(response: AbstractResponse<T>, reply: Response, throwOnError?: boolean) => {
  if (response.error != null) {
    if (throwOnError ?? false) {
      throw response.error
    }
    reply.code(SERVER_ERROR).send(response.error.message)
  } else if (response.outcome != null) {
    switch (response.outcome) {
      case ModuleOutcome.Accepted:
        reply.code(ACCEPTED).send(response.value)
        break
      case ModuleOutcome.Created:
        reply.code(CREATED).send(response.value)
        break
      case ModuleOutcome.Ok:
      default:
        reply.code(OK).send(response.value)
    }
  }
}


export const fixFormatDates = (schema: AnySchemaObject) => {
  if (schema.type === 'object') {
    if (schema.format === 'date-time') {
      schema.type = 'string'
      schema.format = 'date-time'
      if (schema.required != null) {
        delete schema.required
      }
    } else if (schema.properties != null) {
      schema.properties = Object.fromEntries(
        Object.entries(schema.properties).map(([key, value]) => [key, fixFormatDates(value as AnySchemaObject)])
      )
    }
  }

  return schema
}
