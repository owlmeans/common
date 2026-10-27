import type { BotRule } from '@owlmeans/bot'
import type { BotRuleRecord } from '../types.js'

/** A stored rule as `BotRule` — `null` columns read as absent, a scope-wide rule's `connection` as `null`. */
export const ruleViewOf = (record: BotRuleRecord): BotRule => ({
  id: record.id!,
  scope: record.scope,
  connection: record.connection ?? null,
  name: record.name,
  keywords: [...record.keywords],
  mode: record.mode,
  action: record.action,
  ...(record.reply != null ? { reply: record.reply } : {}),
  ...(record.instruction != null ? { instruction: record.instruction } : {}),
  enabled: record.enabled,
  order: record.order,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
})
