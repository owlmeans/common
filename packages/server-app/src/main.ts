

import type { Context } from '@owlmeans/server-api'
import { Module } from '@owlmeans/server-module'

export const main = async <R>(ctx: Context, modules: Module<R>[]) => {
  ctx.registerModules(modules)
  await ctx.configure().init().waitForInitialized()
}
