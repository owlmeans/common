
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { assertContext } from '@owlmeans/context'
import { EntrypointOutcome } from '@owlmeans/entrypoint'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/entrypoint'
import type { RefedEntrypointHandler } from '@owlmeans/server-entrypoint'
import type { Config, Context } from './types.js'
import type { FastifyRequest } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'

/**
 * The context a handler runs against.
 *
 * The HTTP boundary hangs the request-scoped context on the raw Fastify request, so a handler
 * reached that way gets it from there. A request that did not come from Fastify has no `original`
 * at all — a queued call is rebuilt from an envelope, and a socket frame carries its own — so this
 * has to fall back rather than dereference: these handlers are the same functions on every
 * transport, and only the way they were reached differs.
 */
const _castContextFromOriginal = <C extends BasicConfig, T extends BasicContext<C> = BasicContext<C>>(req: AbstractRequest, def: T): T => {
  return req.original?._ctx ?? def
}

export const handleBody: <T>(
  handler: (payload: T, ctx: BasicContext<BasicConfig>, req: AbstractRequest) => Promise<any>
) => RefedEntrypointHandler<AbstractResponse<any>> = handler => ref => async (req, res) => {
  const ctx = assertContext(ref.ref?.ctx) as Context
  try {
    res.resolve(await handler(
      req.body as any,
      _castContextFromOriginal<Config, Context>(req, ctx) as BasicContext<BasicConfig>,
      req,
    ), EntrypointOutcome.Ok)
  } catch (e) {
    res.reject(e as Error)
  }

  return res.value
}

export const handleParams: <T>(
  handler: (payload: T, ctx: BasicContext<BasicConfig>, req: AbstractRequest) => Promise<any>
  // @TODO Here and everywher it looks like AbstractResponse is messed up here instead of abstract request
) => RefedEntrypointHandler<AbstractResponse<any>> = handler => ref => async (req, res) => {
  const ctx = assertContext(ref.ref?.ctx) as Context
  try {
    res.resolve(await handler(
      req.params as any,
      _castContextFromOriginal<Config, Context>(req, ctx) as BasicContext<BasicConfig>,
      req,
    ), EntrypointOutcome.Ok)
  } catch (e) {
    res.reject(e as Error)
  }

  return res.value
}

export const handleRequest: (
  handler: (payload: AbstractRequest, ctx: BasicContext<BasicConfig>, res?: AbstractResponse<any>) => Promise<any>
) => RefedEntrypointHandler<AbstractResponse<any>> = handler => ref => async (req, res) => {
  const ctx = assertContext(ref.ref?.ctx) as Context
  try {
    res.resolve(await handler(
      req, _castContextFromOriginal<Config, Context>(req, ctx) as BasicContext<BasicConfig>, res
    ), EntrypointOutcome.Ok)
  } catch (e) {
    res.reject(e as Error)
  }

  return res.value
}

export const handleIntermediate: (
  handler: (payload: AbstractRequest, ctx: BasicContext<BasicConfig>) => Promise<BasicContext<BasicConfig> | null>
) => RefedEntrypointHandler<AbstractResponse<Context | null>> = handler => ref => async (req, res) => {
  const ctx = assertContext(ref.ref?.ctx) as Context
  try {
    const result = await handler(
      req, _castContextFromOriginal<Config, Context>(req, ctx) as BasicContext<BasicConfig>
    )
    if (result != null) {
      res.resolve(result)
    }

    return res.value
  } catch (e) {
    res.reject(e as Error)
  }
}

export const extractUploadedFile = async <T extends {} = {}>(req: AbstractRequest<T>): Promise<UploadedFile | undefined> => {
  const request = req.original as FastifyRequest

  return request.file()
}

export interface UploadedFile extends MultipartFile { }
