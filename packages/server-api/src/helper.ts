
import { ModuleOutcome } from '@owlmeans/module'
import type { AbstractResponse } from '@owlmeans/module'
import type { makeContext } from './context.js'
import type { RefedModuleHandler } from '@owlmeans/server-module'

export type Context = ReturnType<typeof makeContext>

export const handleBody: (
  handler: (ctx: Context, payload: any) => Promise<any>
) => RefedModuleHandler<AbstractResponse<any>> = handler => ref => async (req, res) => {
  if (ref.ref?.ctx == null) {
    console.log(new SyntaxError('Module context is not provided'))
    throw new SyntaxError('Module context is not provided')
  }
  try {
    res.resolve(await handler(ref.ref.ctx as Context, req.body), ModuleOutcome.Ok)
  } catch (e) {
    res.reject(e as Error)
  }

  return res.value
}

/* handler => ref =>
    async (req: AbstractRequest, res: AbstractResponse<any>) => {
      try {
        res.resolve(await handler(ctx, req.body), ModuleOutcome.Ok)
      } catch (e) {
        res.reject(e as Error)
      }
    }
*/