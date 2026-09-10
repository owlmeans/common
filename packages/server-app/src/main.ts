

import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import type { AppContext, AppConfig } from './types.js'

// @TODO Remove or refactor request types. We actually don't use them and this make
// a mess with <R
export const main = async <R, C extends AppConfig, T extends AppContext<C>>(
  ctx: T, entrypoints: (CommonEntrypoint | ServerEntrypoint<R>)[]
) => {
  ctx.registerEntrypoints(entrypoints)
  await ctx.configure().init()
  await ctx.getApiServer().listen()
}
