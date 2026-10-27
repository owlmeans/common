import { useCallback, useMemo } from 'react'
import { useContext } from '@owlmeans/client'
import { botRuleHelper, type BotRule, type BotRuleInput } from '@owlmeans/bot'
import { botViewHelper } from '../helpers/view.js'
import { botOutcomeUtils } from '../utils/outcome.js'
import type { BotRulesOptions, BotSurface, UseBotRules } from '../types.js'
import { useBotCollection } from './use-bot-collection.js'

/**
 * The keyword groups of one bot surface, in the order the bot applies them.
 *
 * With `connection` it is that connection's groups plus the scope-wide ones (`connection` null) —
 * the server's own filter, held to `botRuleHelper.appliesTo` here as well, so a record saved for
 * another connection never shows in this list.
 */
export const useBotRules = (surface: BotSurface, opts: BotRulesOptions = {}): UseBotRules => {
  const ctx = useContext()
  const connection = opts.connection != null && opts.connection !== '' ? opts.connection : undefined
  const collection = useBotCollection<BotRule>({
    surface, topic: 'rules', key: connection ?? '',
    load: async () => await ctx.entrypoint(surface.rule.list).call({
      query: connection != null ? { connection } : {},
    }),
  })
  const { upsert, drop, publish } = collection

  const items = useMemo(() => botViewHelper.orderRules(
    connection != null
      ? collection.items.filter(rule => botRuleHelper.appliesTo(rule, connection))
      : collection.items
  ), [collection.items, connection])

  const save = useCallback(async (input: BotRuleInput) => {
    const outcome = await botOutcomeUtils.run(async () => await ctx.entrypoint(surface.rule.save).call({ body: input }))
    if (outcome.ok && outcome.value != null) {
      upsert(outcome.value)
      publish('rules')
    }

    return outcome
  }, [ctx, surface, upsert, publish])

  const remove = useCallback(async (id: string) => {
    const outcome = await botOutcomeUtils.run(async () => (await ctx.entrypoint(surface.rule.remove).call({ params: { id } })).id)
    if (outcome.ok) {
      drop(id)
      publish('rules')
    }

    return outcome
  }, [ctx, surface, drop, publish])

  return { items, loading: collection.loading, error: collection.error, reload: collection.reload, save, remove }
}
