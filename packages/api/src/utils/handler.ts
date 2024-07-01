import type { AbstractResponse } from '@owlmeans/module'
import { ModuleOutcome } from '@owlmeans/module'
import { AxiosResponse } from 'axios'
import { ACCEPTED, CREATED, FORBIDDEN_ERROR, OK, SERVER_ERROR, UNAUTHORIZED_ERROR } from '../consts.js'
import { ResilientError } from '@owlmeans/error'
import { ApiClientError, ServerAuthError, ServerCrashedError } from '../errors.js'

export const processError = (response: AxiosResponse, reply: AbstractResponse<any>) => {
  switch (response.status) {
    case OK:
      reply.resolve(response.data, ModuleOutcome.Ok)
      return
    case ACCEPTED:
      reply.resolve(response.data, ModuleOutcome.Accepted)
      return
    case CREATED:
      reply.resolve(response.data, ModuleOutcome.Created)
      return
    default:
      try {
        if (typeof response.data === 'string') {
          reply.reject(ResilientError.ensure(response.data, true))
          return
        }
      } catch {
        console.error(`Server returned an unrecognizable text error: ${response.status} ${response.data}`)
      }
      switch (response.status) {
        case SERVER_ERROR:
          reply.reject(new ServerCrashedError())
          return
        case UNAUTHORIZED_ERROR:
          reply.reject(new ServerAuthError())
          return
        case FORBIDDEN_ERROR:
          reply.reject(new ApiClientError('forbidden'))
          return
        default:
          reply.reject(new ApiClientError(`${response.status}`))
          return
      }
  }
}
