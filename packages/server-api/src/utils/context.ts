import { assertContext } from '@owlmeans/context'
import type { Config, Context, Request } from '../types.js'
import { DEFAULT_ALIAS } from '../consts.js'

export const populateContext = <C extends Config, T extends Context<C>>(req: Request, context: T): void =>
  void ((req as any)._ctx = context)

export const extractContext = <C extends Config, T extends Context<C>>(req: Request, ctx?: T, location?: string): T =>
  assertContext<C, T>((req as any)._ctx ?? ctx, location ?? DEFAULT_ALIAS)
