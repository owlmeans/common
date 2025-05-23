
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { assertContext } from '@owlmeans/context'
import { ModuleOutcome } from '@owlmeans/module'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/module'
import type { RefedModuleHandler } from '@owlmeans/server-module'
import type { Config, Context } from './types.js'
import type { FastifyRequest } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'

const _castContextFromOriginal = <C extends BasicConfig, T extends BasicContext<C> = BasicContext<C>>(req: AbstractRequest, def: T): T => {
  return req.original._ctx ?? def
}

export const handleBody: <T>(
  handler: (payload: T, ctx: BasicContext<BasicConfig>, req: AbstractRequest) => Promise<any>
) => RefedModuleHandler<AbstractResponse<any>> = handler => ref => async (req, res) => {
  const ctx = assertContext(ref.ref?.ctx) as Context
  try {
    res.resolve(await handler(
      req.body as any,
      _castContextFromOriginal<Config, Context>(req, ctx) as BasicContext<BasicConfig>,
      req,
    ), ModuleOutcome.Ok)
  } catch (e) {
    res.reject(e as Error)
  }

  return res.value
}

export const handleParams: <T>(
  handler: (payload: T, ctx: BasicContext<BasicConfig>, req: AbstractRequest) => Promise<any>
  // @TODO Here and everywher it looks like AbstractResponse is messed up here instead of abstract request
) => RefedModuleHandler<AbstractResponse<any>> = handler => ref => async (req, res) => {
  const ctx = assertContext(ref.ref?.ctx) as Context
  try {
    res.resolve(await handler(
      req.params as any,
      _castContextFromOriginal<Config, Context>(req, ctx) as BasicContext<BasicConfig>,
      req,
    ), ModuleOutcome.Ok)
  } catch (e) {
    res.reject(e as Error)
  }

  return res.value
}

export const handleRequest: (
  handler: (payload: AbstractRequest, ctx: BasicContext<BasicConfig>, res?: AbstractResponse<any>) => Promise<any>
) => RefedModuleHandler<AbstractResponse<any>> = handler => ref => async (req, res) => {
  const ctx = assertContext(ref.ref?.ctx) as Context
  try {
    res.resolve(await handler(
      req, _castContextFromOriginal<Config, Context>(req, ctx) as BasicContext<BasicConfig>, res
    ), ModuleOutcome.Ok)
  } catch (e) {
    res.reject(e as Error)
  }

  return res.value
}

export const handleIntermediate: (
  handler: (payload: AbstractRequest, ctx: BasicContext<BasicConfig>) => Promise<BasicContext<BasicConfig> | null>
) => RefedModuleHandler<AbstractResponse<Context | null>> = handler => ref => async (req, res) => {
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
