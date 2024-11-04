

import type { ServerModule } from '@owlmeans/server-module'
import type { CommonModule } from '@owlmeans/module'
import type { AppContext, AppConfig } from './types.js'

// @TODO Remove or refactor request types. We actually don't use them and this make
// a mess with <R
export const main = async <R, C extends AppConfig, T extends AppContext<C>>(
  ctx: T, modules: (CommonModule | ServerModule<R>)[]
) => {
  ctx.registerModules(modules)
  await ctx.configure().init()
  await ctx.getApiServer().listen()
}
