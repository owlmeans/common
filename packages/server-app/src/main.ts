

import type { ServerModule } from '@owlmeans/server-module'
import type { CommonModule } from '@owlmeans/module'
import type { AppContext, AppConfig } from './types.js'

export const main = async <R, C extends AppConfig, T extends AppContext<C>>(
  ctx: T, modules: (CommonModule | ServerModule<R>)[]
) => {
  ctx.registerModules(modules)
  await ctx.configure().init()
  await ctx.waitForInitialized()
}
