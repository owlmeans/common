import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { BotHandle, BotHandler } from './types.js'

/**
 * Declare a handler — what a target's `sources/backend/src/bot/handlers/<slug>.ts` exports:
 * `export const moderate = botHandler('moderate', async (update, bot, ctx) => { … })`. The name is
 * stable: a retried update skips the handlers that already completed, by name.
 */
export const botHandler = <C = BasicContext<BasicConfig>>(name: string, handle: BotHandle<C>): BotHandler<C> =>
  Object.freeze({ name, handle })
