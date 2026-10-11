import { assertContext } from '@owlmeans/context'
import type { Config, Context, Request } from '../types.js'
import { DEFAULT_ALIAS } from '../consts.js'
import type { RequestContextHelper } from './context/types.js'

export const makeRequestContextHelper = (req: Request): RequestContextHelper => {
  const populateContext = <C extends Config, T extends Context<C>>(context: T): void =>
    void ((req as any)._ctx = context)

  const extractContext = <C extends Config, T extends Context<C>>(ctx?: T, location?: string): T =>
    assertContext<C, T>((req as any)._ctx ?? ctx, location ?? DEFAULT_ALIAS)

  return { populateContext, extractContext }
}
