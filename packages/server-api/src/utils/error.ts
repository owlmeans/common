import { FORBIDDEN_ERROR, SERVER_ERROR, UNAUTHORIZED_ERROR } from '@owlmeans/api'
import type { FastifyReply } from 'fastify'
import { AccessError, AuthFailedError } from '../errors.js'
import { ResilientError } from '@owlmeans/error'

export const handleError = (error: Error, reply: FastifyReply) => {
  let code: number = SERVER_ERROR
  if (error instanceof AuthFailedError) {
    code = UNAUTHORIZED_ERROR
  } else if (error instanceof AccessError) {
    code = FORBIDDEN_ERROR
  }
  if (!reply.sent) {
    reply.code(code).send(
      ResilientError.marshal(ResilientError.ensure(error as Error)).message
    )
  }
}
