import { useCallback } from 'react'
import { useContext } from '@owlmeans/client'
import type { BotConnection, BotConnectionInput } from '@owlmeans/bot'
import { botOutcomeUtils } from '../utils/outcome.js'
import type { BotSurface, UseBotConnections } from '../types.js'
import { useBotCollection } from './use-bot-collection.js'

/**
 * The connections of one bot surface — `appProtocols.api.bot.operator` or `.member` — and what can
 * be done to them.
 *
 * Every operation answers an outcome instead of throwing; a change is put in place from the
 * server's answer and announced to every other hook over the same surface, so a second list on the
 * screen (the screen's own, the activity panel's labels) follows without a reload.
 */
export const useBotConnections = (surface: BotSurface): UseBotConnections => {
  const ctx = useContext()
  const collection = useBotCollection<BotConnection>({
    surface, topic: 'connections', key: '',
    load: async () => await ctx.entrypoint(surface.connection.list).call(),
  })
  const { upsert, drop, publish } = collection

  const save = useCallback(async (input: BotConnectionInput) => {
    const outcome = await botOutcomeUtils.run(async () => await ctx.entrypoint(surface.connection.save).call({ body: input }))
    if (outcome.ok && outcome.value != null) {
      upsert(outcome.value)
      publish('connections')
    }

    return outcome
  }, [ctx, surface, upsert, publish])

  const verify = useCallback(async (id: string) => {
    const outcome = await botOutcomeUtils.run(async () => await ctx.entrypoint(surface.connection.verify).call({ params: { id } }))
    if (outcome.ok && outcome.value != null) {
      upsert(outcome.value)
      publish('connections')
    }

    return outcome
  }, [ctx, surface, upsert, publish])

  const remove = useCallback(async (id: string) => {
    const outcome = await botOutcomeUtils.run(async () => (await ctx.entrypoint(surface.connection.remove).call({ params: { id } })).id)
    if (outcome.ok) {
      drop(id)
      publish('connections')
    }

    return outcome
  }, [ctx, surface, drop, publish])

  return {
    items: collection.items, loading: collection.loading, error: collection.error, reload: collection.reload,
    save, verify, remove,
  }
}
