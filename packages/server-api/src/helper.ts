
import type { AbstractRequest, AbstractResponse } from '@owlmeans/module'
import type { makeContext } from './context.js'
import type { ModuleHandler } from './types.js'

export type Context = ReturnType<typeof makeContext>

export const handleBody: (handler: (ctx: Context, paload: any) => Promise<any>) => ModuleHandler = handler =>
  async (req: AbstractRequest, res: AbstractResponse<any>, ctx: Context) => {
    try {
      res.resolve(await handler(ctx, req.body))
    } catch (e) {
      res.reject(e as Error)
    }
  }
