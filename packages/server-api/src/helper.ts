
import { ModuleOutcome } from '@owlmeans/module'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/module'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { RefedModuleHandler } from '@owlmeans/server-module'

type Config = ServerConfig
type Context = ServerContext<Config>

export const handleBody: (
  handler: (payload: any, ctx: Context) => Promise<any>
) => RefedModuleHandler<AbstractResponse<any>> = handler => ref => async (req, res) => {
  if (ref.ref?.ctx == null) {
    console.log(new SyntaxError('Module context is not provided'))
    throw new SyntaxError('Module context is not provided')
  }
  try {
    res.resolve(await handler(req.body, ref.ref.ctx as Context), ModuleOutcome.Ok)
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
    res.resolve(await handler(req as any, ref.ref.ctx as Context), ModuleOutcome.Ok)
  } catch (e) {
    res.reject(e as Error)
  }

  return res.value
}
