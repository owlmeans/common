import { BOT_ACTIVITY_LIMIT_DEFAULT, BOT_ACTIVITY_LIMIT_MAX, type BotActivity } from '@owlmeans/bot'
import type { BotActivityListOptions, BotActivityRecord } from '../types.js'
import type { BotActivityPart, BotServiceParts } from './types.local.js'

export const makeBotActivity = (parts: BotServiceParts): BotActivityPart => {
  const { store, log } = parts

  const view = (record: BotActivityRecord): BotActivity => ({
    id: record.id!,
    scope: record.scope,
    connection: record.connection,
    platform: record.platform,
    ...(record.update != null ? { update: record.update } : {}),
    action: record.action,
    ...(record.target != null
      ? {
        target: {
          chat: record.target.chat,
          ...(record.target.message != null ? { message: record.target.message } : {}),
          ...(record.target.user != null ? { user: record.target.user } : {}),
        },
      }
      : {}),
    ...(record.text != null ? { text: record.text } : {}),
    ...(record.rule != null ? { rule: record.rule } : {}),
    ok: record.ok,
    ...(record.error != null ? { error: record.error } : {}),
    ...(record.code != null ? { code: record.code } : {}),
    transport: record.transport,
    at: record.at,
  })

  const list = async (scope: string, opts: BotActivityListOptions = {}): Promise<BotActivity[]> => {
    const requested = Number(opts.limit ?? BOT_ACTIVITY_LIMIT_DEFAULT)
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), BOT_ACTIVITY_LIMIT_MAX)
      : BOT_ACTIVITY_LIMIT_DEFAULT
    const { items } = await store.activities().list(
      { scope, ...(opts.connection != null ? { connection: opts.connection } : {}) },
      { sort: [{ field: 'at', order: 'desc' }], size: limit }
    )

    return items.map(view)
  }

  /** Strictly increasing within the process, so two actions of one handler keep their order. */
  let last = 0
  const at = (): string => {
    last = Math.max(parts.now().getTime(), last + 1)
    return new Date(last).toISOString()
  }

  const record = async (activity: Omit<BotActivityRecord, 'id' | 'at'>): Promise<void> => {
    try {
      await store.activities().create({ ...activity, at: at() })
    } catch (error) {
      log.error('Bot activity not recorded', { connection: activity.connection, action: activity.action, error })
    }
  }

  return { list, record }
}
