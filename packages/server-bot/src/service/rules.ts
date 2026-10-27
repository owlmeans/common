import { botRuleHelper, BotMatchMode, type BotRule, type BotRuleInput } from '@owlmeans/bot'
import { BotRuleInvalid, BotRuleNotFound } from '../errors.js'
import type { BotRuleRecord, BotRulesApi } from '../types.js'
import { ruleViewOf } from './rule-view.js'
import type { BotServiceParts, BotSessions } from './types.local.js'

export const makeBotRules = (parts: BotServiceParts, sessions: BotSessions): BotRulesApi => {
  const { store, log } = parts

  const byOrder = (left: BotRuleRecord, right: BotRuleRecord): number =>
    (left.order - right.order) || left.createdAt.localeCompare(right.createdAt)

  const find = async (scope: string, id: string): Promise<BotRuleRecord> => {
    const record = await store.rules().load(id)
    if (record == null || record.scope !== scope) {
      throw new BotRuleNotFound(id)
    }

    return record
  }

  const list = async (scope: string, connection?: string): Promise<BotRule[]> => {
    const { items } = await store.rules().list({ scope }, { size: 0 })

    return items
      .filter(rule => connection == null || botRuleHelper.appliesTo(rule, connection))
      .sort(byOrder)
      .map(ruleViewOf)
  }

  const save = async (scope: string, input: BotRuleInput): Promise<BotRule> => {
    const existing = input.id != null ? await find(scope, input.id) : null
    const connection = input.connection !== undefined ? input.connection : existing?.connection ?? null
    if (connection != null) {
      await sessions.find(scope, connection)
    }
    const keywords = botRuleHelper.normalizeKeywords(input.keywords ?? [])
    if (keywords.length === 0) {
      throw new BotRuleInvalid('keywords')
    }
    const stamp = sessions.stamp()
    const keep = (value: string | undefined, kept: string | null | undefined): string | null =>
      value !== undefined ? (value === '' ? null : value) : kept ?? null

    const record: BotRuleRecord = {
      ...(existing ?? {}),
      scope,
      connection,
      name: input.name,
      keywords,
      mode: input.mode ?? existing?.mode ?? BotMatchMode.Word,
      action: input.action,
      reply: keep(input.reply, existing?.reply),
      instruction: keep(input.instruction, existing?.instruction),
      enabled: input.enabled ?? existing?.enabled ?? true,
      order: input.order ?? existing?.order ?? await store.rules().count({ scope }),
      createdAt: existing?.createdAt ?? stamp,
      updatedAt: stamp,
    }
    const saved = existing != null ? await store.rules().save(record) : await store.rules().create(record)
    log.debug('Bot rule saved', { rule: saved.id, connection: saved.connection ?? null, keywords: keywords.length })

    return ruleViewOf(saved)
  }

  const remove = async (scope: string, id: string): Promise<{ id: string }> => {
    await find(scope, id)
    await store.rules().delete(id)

    return { id }
  }

  return { list, save, remove }
}
