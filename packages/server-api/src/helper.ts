
import { ModuleOutcome } from '@owlmeans/module'
import type { AbstractResponse } from '@owlmeans/module'
import type { makeContext } from './context.js'
import type { RefedModuleHandler } from '@owlmeans/server-module'

export type Context = ReturnType<typeof makeContext>

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
