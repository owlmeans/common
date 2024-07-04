
export { makeContext } from '@owlmeans/server-api'
export type { Context, Config } from '@owlmeans/server-api'
export { config, service, addWebService } from '@owlmeans/server-api'
export { AppType } from '@owlmeans/context'
import type { Context } from '@owlmeans/server-api'
import { modules } from './modules.js'

export const main = async (ctx: Context) => {
  ctx.registerModules(modules)
  await ctx.configure().init().waitForInitialized()
}
