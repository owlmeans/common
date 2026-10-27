import { describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext, type BasicConfig } from '@owlmeans/context'
import { addLogPlugin, memoryPlugin } from '@owlmeans/log'
import { pgDeclarationHelper, pgDiffHelper, pgSchemaHelper } from '@owlmeans/postgres-resource'
import type { TableSpec } from '@owlmeans/postgres-resource'
import {
  BotActivityRecordSchema, BotConnectionRecordSchema, BotUpdateRecordSchema, RES_BOT_ACTIVITY, RES_BOT_CONNECTION,
  RES_BOT_UPDATE,
} from '@owlmeans/server-bot'

import {
  appendPostgresBot, makeBotActivityResource, makeBotConnectionResource, makeBotUpdateResource,
} from '../src/index.js'
import type { BotUpdateResource } from '../src/index.js'

const ALIASES = [RES_BOT_CONNECTION, RES_BOT_UPDATE, RES_BOT_ACTIVITY]

const SCHEMAS: Record<string, object> = {
  [RES_BOT_CONNECTION]: BotConnectionRecordSchema,
  [RES_BOT_UPDATE]: BotUpdateRecordSchema,
  [RES_BOT_ACTIVITY]: BotActivityRecordSchema,
}

const reset = (): void => {
  for (const alias of ALIASES) {
    pgDeclarationHelper.resetDeclarations(alias)
  }
}

const makeAll = (): void => {
  makeBotConnectionResource()
  makeBotUpdateResource()
  makeBotActivityResource()
}

/** What `init()` compiles for an alias: the shared schema plus the maker's declared indexes. */
const specOf = (alias: string): TableSpec => pgSchemaHelper.schemaToTableSpec(
  alias, SCHEMAS[alias] as never, 'app', alias.replace('-', '_'), true, pgDeclarationHelper.getDeclaration(alias).indexes
)

const typeOf = (spec: TableSpec, property: string) => {
  const column = spec.byProperty[property]

  return { sqlType: column.sqlType, jsonb: column.jsonb, array: column.array, notNull: column.notNull }
}

/** The DDL a fresh table is created with — what `init()` runs against an empty schema. */
const ddlOf = (spec: TableSpec): string[] =>
  pgDiffHelper.planSync(spec, { exists: false, columns: [], indexes: [], constraints: [] }).statements.map(entry => entry.sql)

/**
 * No database: `schemaToTableSpec` is the compiler `init()` runs, so what each table becomes is
 * pinned here — nested objects are one `jsonb` column, string lists native `text[]`, timestamps
 * `text` (never `timestamptz`, which would marshal through `Date`), and the reserved `order` column
 * is quoted wherever it is named.
 */
describe('@owlmeans/bot-postgres — table shapes', () => {
  test('each maker assigns server-bot\'s schema, not a copy, under the default alias', () => {
    reset()
    const made = [makeBotConnectionResource(), makeBotUpdateResource(), makeBotActivityResource()]

    expect(made.map(resource => resource.alias)).toEqual(ALIASES)
    expect(made.map(resource => resource.schema)).toEqual(ALIASES.map(alias => SCHEMAS[alias]))
    made.forEach((resource, at) => expect(resource.schema).toBe(SCHEMAS[ALIASES[at]] as never))
  })

  test('every table has exactly its schema\'s properties as columns, timestamps as text', () => {
    reset()
    makeAll()
    for (const alias of ALIASES) {
      const spec = specOf(alias)
      const properties = Object.keys((SCHEMAS[alias] as { properties: object }).properties).sort()
      expect([alias, spec.columns.map(column => column.property).sort()]).toEqual([alias, properties])
      expect([alias, spec.primaryKey]).toEqual([alias, ['id']])
      for (const column of spec.columns.filter(entry => /At$/.test(entry.property))) {
        expect([alias, column.property, column.sqlType, column.jsonType]).toEqual([alias, column.property, 'text', 'string'])
      }
    }
  })

  test('nested objects are one jsonb column each; string lists are native text[]', () => {
    reset()
    makeAll()
    const connection = specOf(RES_BOT_CONNECTION)
    const update = specOf(RES_BOT_UPDATE)
    const activity = specOf(RES_BOT_ACTIVITY)

    const jsonb = { sqlType: 'jsonb', jsonb: true, array: false }
    expect(typeOf(connection, 'identity')).toEqual({ ...jsonb, notNull: false })
    expect(typeOf(update, 'update')).toEqual({ ...jsonb, notNull: true })
    expect(typeOf(activity, 'target')).toEqual({ ...jsonb, notNull: false })

    const strings = { sqlType: 'text[]', jsonb: false, array: true }
    expect(typeOf(connection, 'setup')).toEqual({ ...strings, notNull: false })
    expect(typeOf(connection, 'credentialsSet')).toEqual({ ...strings, notNull: true })
    expect(typeOf(update, 'handled')).toEqual({ ...strings, notNull: true })

    /** The sealed credentials are ONE opaque text column, never split per credential key. */
    expect(typeOf(connection, 'sealed')).toEqual({ sqlType: 'text', jsonb: false, array: false, notNull: false })
    expect(typeOf(update, 'attempts').sqlType).toBe('integer')
    expect(typeOf(connection, 'enabled').sqlType).toBe('boolean')
    expect(connection.checks.map(check => check.name).sort()).toEqual([
      'bot_connection_platform_enum', 'bot_connection_receive_enum', 'bot_connection_status_enum', 'bot_connection_transport_enum',
    ])
  })

  test('the activity\'s ref is a nullable text column — the handler\'s opaque reference', () => {
    reset()
    makeAll()
    const activity = specOf(RES_BOT_ACTIVITY)

    expect(typeOf(activity, 'ref')).toEqual({ sqlType: 'text', jsonb: false, array: false, notNull: false })
    expect(activity.byProperty.rule).toBeUndefined()
    const [create] = ddlOf(activity)
    expect(create).toContain('"ref" text')
  })

  test('the inbox dedupe key is a unique index, and every index the reads need is declared', () => {
    reset()
    makeAll()
    const names = (alias: string) => pgDeclarationHelper.getDeclaration(alias).indexes
      .map(index => [index.name, index.columns, index.unique === true])

    expect(names(RES_BOT_CONNECTION)).toEqual([
      ['bot_connection_scope_created', ['scope', 'createdAt'], false],
      ['bot_connection_receive', ['enabled', 'status', 'receive'], false],
    ])
    expect(names(RES_BOT_UPDATE)).toEqual([
      ['bot_update_dedupe', ['dedupe'], true],
      ['bot_update_inbox', ['status', 'receivedAt'], false],
      ['bot_update_lease', ['status', 'claimedAt'], false],
      ['bot_update_connection_received', ['connection', 'receivedAt'], false],
      ['bot_update_retention', ['status', 'processedAt'], false],
    ])
    expect(names(RES_BOT_ACTIVITY)).toEqual([
      ['bot_activity_scope_at', ['scope', 'at'], false],
      ['bot_activity_scope_connection_at', ['scope', 'connection', 'at'], false],
    ])
    expect(ddlOf(specOf(RES_BOT_UPDATE))).toContain(
      'CREATE UNIQUE INDEX "bot_update_dedupe" ON "app"."bot_update" USING btree ("dedupe")'
    )
  })

  test('a maker run twice declares its indexes once, and nothing warns at compile time', () => {
    reset()
    const memory = memoryPlugin('bot-postgres-schema')
    const remove = addLogPlugin(memory)
    try {
      makeAll()
      makeAll()
      for (const alias of ALIASES) {
        const names = pgDeclarationHelper.getDeclaration(alias).indexes.map(index => index.name)
        expect([alias, names.length]).toEqual([alias, new Set(names).size])
        specOf(alias)
      }
      expect(memory.records.filter(record => record.level === 'warn' || record.level === 'error')).toEqual([])
    } finally {
      remove()
    }
  })

  test('appendPostgresBot registers the three once, and custom aliases name their own tables and indexes', () => {
    const context = makeBasicContext<BasicConfig>({ ready: false, service: 'bot-pg-schema', type: AppType.Backend, services: {} })
    appendPostgresBot(context)
    const first = ALIASES.map(alias => context.resource(alias))
    appendPostgresBot(context)
    expect(ALIASES.map(alias => context.resource(alias))).toEqual(first)
    first.forEach((resource, at) => expect(context.resource(ALIASES[at])).toBe(resource))

    const custom = { connection: 'chat-connection', update: 'chat-update', activity: 'chat-activity' }
    appendPostgresBot(context, { resources: custom })
    expect(Object.values(custom).map(alias => context.resource<BotUpdateResource>(alias).schema))
      .toEqual(ALIASES.map(alias => SCHEMAS[alias]))
    expect(pgDeclarationHelper.getDeclaration('chat-update').indexes.map(index => index.name))
      .toContain('chat_update_dedupe')
  })
})
