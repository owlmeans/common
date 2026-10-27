import { useContext } from '@owlmeans/client'
import type { BotActivity, BotActivityQuery } from '@owlmeans/bot'
import type { BotActivityOptions, BotSurface, UseBotActivity } from '../types.js'
import { useBotCollection } from './use-bot-collection.js'

/**
 * What the bot of one surface did, newest first — every reply, deletion, mute or ban, its target,
 * the handler's `ref` and whether the platform accepted it.
 *
 * `refreshMs` reads again on a timer, but only while the page is visible, and once more when it
 * becomes visible again; a background read never shows `loading`.
 */
export const useBotActivity = (surface: BotSurface, opts: BotActivityOptions = {}): UseBotActivity => {
  const ctx = useContext()
  const query: BotActivityQuery = {
    ...(opts.connection != null && opts.connection !== '' ? { connection: opts.connection } : {}),
    ...(opts.limit != null ? { limit: opts.limit } : {}),
  }
  const collection = useBotCollection<BotActivity>({
    surface, topic: 'activity', key: `${query.connection ?? ''}|${query.limit ?? ''}`,
    load: async () => await ctx.entrypoint(surface.activity.list).call({ query }),
    refreshMs: opts.refreshMs,
  })

  return { items: collection.items, loading: collection.loading, error: collection.error, reload: collection.reload }
}
