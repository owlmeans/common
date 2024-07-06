

import type { Module } from '@owlmeans/server-module'
import type { Context } from './types.js'

export const main = async <R>(ctx: Context, modules: Module<R>[]) => {
  ctx.registerModules(modules)
  await ctx.configure().init().waitForInitialized()
}
