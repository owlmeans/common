import { afterAll, describe, expect, test } from 'bun:test'
import { makePgIntrospectHelper, pgDiffHelper } from '@owlmeans/postgres-resource'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import { BotChatKind, BotMatchMode, BotPlatform, BotRuleAction, BotUpdateKind } from '@owlmeans/bot'
import { RecordExists } from '@owlmeans/resource'
import { BotInboxStatus, RES_BOT_ACTIVITY, RES_BOT_CONNECTION, RES_BOT_RULE, RES_BOT_UPDATE } from '@owlmeans/server-bot'
import type { BotUpdateRecord } from '@owlmeans/server-bot'

import { appendPostgresBot } from '../src/index.js'
import type { BotRuleResource, BotUpdateResource } from '../src/index.js'
import { gate, makeSuite } from './context.js'

const ALIASES = [RES_BOT_CONNECTION, RES_BOT_RULE, RES_BOT_UPDATE, RES_BOT_ACTIVITY]

const suite = makeSuite('tables')
const it = gate.skip ? test.skip : test

/** An inbox row as the service writes it — no id: Postgres mints it. */
const inboxRow = (dedupe: string): Omit<BotUpdateRecord, 'id'> => ({
  scope: 'tables', connection: 'c-1', platform: BotPlatform.Telegram, dedupe,
  status: BotInboxStatus.Pending, attempts: 0, handled: [], receivedAt: '2026-10-26T10:00:00.000Z',
  update: {
    connection: 'c-1', scope: 'tables', platform: BotPlatform.Telegram, kind: BotUpdateKind.Message,
    chat: { id: '-100', kind: BotChatKind.Group }, addressed: false, receivedAt: '2026-10-26T10:00:00.000Z',
  },
})

describe('@owlmeans/bot-postgres — tables against a real database', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'postgres gate closed', () => {})

    return
  }

  afterAll(async () => {
    await suite.teardown()
  })

  it('a second boot reconciles nothing on any of the four tables', async () => {
    await suite.boot()
    const again = await suite.boot()
    const { pool } = await again.context.resource<PostgresResource<never>>(RES_BOT_CONNECTION).db()
    const client = await pool.connect()
    try {
      for (const alias of ALIASES) {
        const table = again.context.resource<PostgresResource<never>>(alias).table
        expect(table.qualified).toBe(`"${suite.schema}"."${alias.replace('-', '_')}"`)
        const live = await makePgIntrospectHelper(client).introspectTable(table.schema, table.table, table.qualified)
        expect([alias, pgDiffHelper.planSync(table, live).statements.map(statement => statement.sql)]).toEqual([alias, []])
      }
    } finally {
      client.release()
    }
  })

  it('round-trips nested values, string lists and the order column; the dedupe key is unique', async () => {
    const { context } = await suite.boot()
    const updates = context.resource<BotUpdateResource>(RES_BOT_UPDATE)
    const rules = context.resource<BotRuleResource>(RES_BOT_RULE)

    const row = await updates.create(inboxRow('c-1:telegram:1'))
    expect(typeof row.id).toBe('string')
    const stored = await updates.get(row.id!)
    expect([stored.handled, stored.update.chat, stored.claimedAt]).toEqual([[], { id: '-100', kind: BotChatKind.Group }, null])
    await expect(updates.create(inboxRow('c-1:telegram:1'))).rejects.toThrow(RecordExists)

    const rule = await rules.create({
      scope: 'tables', name: 'Spam', keywords: ['casino', 'free money'], mode: BotMatchMode.Word, action: BotRuleAction.Delete,
      enabled: true, order: 2.5, createdAt: '2026-10-26T10:00:00.000Z', updatedAt: '2026-10-26T10:00:00.000Z',
    })
    const sorted = await rules.list({ scope: 'tables' }, { sort: [{ field: 'order', order: 'desc' }] })
    expect(sorted.items.map(item => [item.id, item.order, item.keywords, item.connection])).toEqual([
      [rule.id, 2.5, ['casino', 'free money'], null],
    ])
  })

  it('custom aliases get tables and index names of their own', async () => {
    const custom = { connection: 'chat-connection', rule: 'chat-rule', update: 'chat-update', activity: 'chat-activity' }
    const { context } = await suite.boot({ bot: { resources: custom } })
    const registered = context.resource(custom.update)
    appendPostgresBot(context, { resources: custom })
    expect(context.resource(custom.update)).toBe(registered)

    const updates = context.resource<BotUpdateResource>(custom.update)
    expect(updates.table.table).toBe('chat_update')
    await updates.create(inboxRow('c-1:telegram:2'))
    await expect(updates.create(inboxRow('c-1:telegram:2'))).rejects.toThrow(RecordExists)
  })
})
