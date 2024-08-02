
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { ModuleOutcome } from '@owlmeans/module'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/module'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { RefedModuleHandler } from '@owlmeans/server-module'

type Config = ServerConfig
type Context = ServerContext<Config>

const _castContextFromOriginal = <C extends BasicConfig, T extends BasicContext<C> = BasicContext<C>>(req: AbstractRequest, def: T): T => {
  return req.original._ctx ?? def
}

export const handleBody: <T>(
  handler: (payload: T, ctx: Context) => Promise<any>
) => RefedModuleHandler<AbstractResponse<any>> = handler => ref => async (req, res) => {
  if (ref.ref?.ctx == null) {
    console.log(new SyntaxError('Module context is not provided'))
    throw new SyntaxError('Module context is not provided')
  }
  try {
    res.resolve(await handler(
      req.body as any,
      _castContextFromOriginal<Config, Context>(req, ref.ref.ctx as Context)
    ), ModuleOutcome.Ok)
  } catch (e) {
    res.reject(e as Error)
  }

  return res.value
}

export const handleParams: <T>(
  handler: (payload: T, ctx: Context) => Promise<any>
) => RefedModuleHandler<AbstractResponse<any>> = handler => ref => async (req, res) => {
  if (ref.ref?.ctx == null) {
    console.log(new SyntaxError('Module context is not provided'))
    throw new SyntaxError('Module context is not provided')
  }
  try {
    res.resolve(await handler(
      req.params as any,
      _castContextFromOriginal<Config, Context>(req, ref.ref.ctx as Context)
    ), ModuleOutcome.Ok)
  } catch (e) {
    res.reject(e as Error)
  }

  return res.value
}

export const handleRequest: (
  handler: (payload: AbstractRequest, ctx: Context) => Promise<any>
) => RefedModuleHandler<AbstractResponse<any>> = handler => ref => async (req, res) => {
  if (ref.ref?.ctx == null) {
    console.log(new SyntaxError('Module context is not provided'))
    throw new SyntaxError('Module context is not provided')
  }
  try {
    res.resolve(await handler(
      req, _castContextFromOriginal<Config, Context>(req, ref.ref.ctx as Context)
    ), ModuleOutcome.Ok)
  } catch (e) {
    res.reject(e as Error)
  }

  return res.value
}

export const handleIntermediate: (
  handler: (payload: AbstractRequest, ctx: Context) => Promise<Context | null>
) => RefedModuleHandler<AbstractResponse<Context | null>> = handler => ref => async (req, res) => {
  if (ref.ref?.ctx == null) {
    console.log(new SyntaxError('Module context is not provided'))
    throw new SyntaxError('Module context is not provided')
  }
  try {
    const result = await handler(req, _castContextFromOriginal<Config, Context>(req, ref.ref.ctx as Context))
    if (result != null) {
      res.resolve(result)
    }

    return res.value
  } catch (e) {
    res.reject(e as Error)
  }
}
