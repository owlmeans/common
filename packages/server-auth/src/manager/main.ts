
import type { Context } from '@owlmeans/server-api'
import { modules } from './modules.js'

export const main = async (ctx: Context) => {
  ctx.registerModules(modules)
  await ctx.configure().init().waitForInitialized()
}
