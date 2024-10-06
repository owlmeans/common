
import { modules } from './modules.js'
import type { AppContext, AppConfig } from './types.js'

export const main = async <C extends AppConfig, T extends AppContext<C>>(ctx: T) => {
  ctx.registerModules(modules)
  await ctx.configure().init()
  await ctx.getApiServer().listen()
}
