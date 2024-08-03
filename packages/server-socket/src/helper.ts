import { assertContext } from '@owlmeans/context'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/module'
import type { Context } from '@owlmeans/server-api'
import type { RefedModuleHandler } from '@owlmeans/server-module'

export const handleConnection: <T extends {} = {}>(
  handler: (conn: T, ctx: Context, res: AbstractResponse<any>, req: AbstractRequest<T>) => Promise<void>
) => RefedModuleHandler<AbstractResponse<any>> = handler => ref => async (req, res) => {
  const ctx = assertContext(ref.ref?.ctx) as Context
  try {
    await handler(req.body as any, ctx, res, req)
  } catch (e) {
    res.reject(e as Error)
  }

  // Actually it does nothing - just for compatibility here
  return res.value
}
