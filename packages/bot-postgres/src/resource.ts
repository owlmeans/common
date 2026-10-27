import { makePostgresResource, pgDeclarationHelper, pgNameHelper } from '@owlmeans/postgres-resource'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import {
  BotActivityRecordSchema, BotConnectionRecordSchema, BotUpdateRecordSchema, RES_BOT_ACTIVITY, RES_BOT_CONNECTION,
  RES_BOT_UPDATE,
} from '@owlmeans/server-bot'
import type { BotActivityRecord, BotConnectionRecord, BotUpdateRecord } from '@owlmeans/server-bot'

import type { BotActivityResource, BotConnectionResource, BotUpdateResource } from './types.js'
import type { IndexList } from './types.local.js'

/**
 * Declare the indexes a maker owns, each once. Declarations are kept per alias at module scope, so a
 * maker that runs twice (a target's file wrapping it, a spec) would otherwise declare every index
 * again and the compiler would warn about the duplicate on every boot. The name carries the table,
 * so a second set of bot tables under other aliases in the same schema never collides with the first.
 */
const declareIndexes = <T extends ResourceRecord>(resource: PostgresResource<T>, alias: string, indexes: IndexList): void => {
  const table = pgNameHelper.pgIdentifier(alias)
  const declared = pgDeclarationHelper.getDeclaration(alias).indexes
  for (const [suffix, spec] of indexes) {
    const name = `${table}_${suffix}`
    if (!declared.some(index => index.name === name)) {
      resource.index(name, spec)
    }
  }
}

/**
 * `bot-connection` — the connections of every scope. The schema is `server-bot`'s own, assigned, never
 * copied: `identity` compiles to one `jsonb` column, `setup` and `credentialsSet` to `text[]`, the
 * sealed credentials to one `text` column. Indexes follow the reads: a scope's list by creation, and
 * the worker's reconciliation (enabled, connected, polling or on the gateway).
 */
export const makeBotConnectionResource = (
  dbAlias?: string, alias: string = RES_BOT_CONNECTION, serviceAlias?: string
): BotConnectionResource => {
  const resource = makePostgresResource<BotConnectionRecord, BotConnectionResource>(alias, dbAlias, serviceAlias)
  resource.schema = BotConnectionRecordSchema
  declareIndexes(resource, alias, [
    ['scope_created', { columns: ['scope', 'createdAt'] }],
    ['receive', { columns: ['enabled', 'status', 'receive'] }],
  ])

  return resource
}

/**
 * `bot-update` — the inbox. `dedupe` is UNIQUE: two concurrent deliveries of one platform update
 * collide here (`RecordExists`) and the service reads the stored row back. The normalized `update`
 * is one `jsonb` column, `handled` a `text[]`. Indexes follow the dispatcher (pending rows by age,
 * expired leases), a connection's newest update, and the retention purge.
 */
export const makeBotUpdateResource = (
  dbAlias?: string, alias: string = RES_BOT_UPDATE, serviceAlias?: string
): BotUpdateResource => {
  const resource = makePostgresResource<BotUpdateRecord, BotUpdateResource>(alias, dbAlias, serviceAlias)
  resource.schema = BotUpdateRecordSchema
  declareIndexes(resource, alias, [
    ['dedupe', { columns: ['dedupe'], unique: true }],
    ['inbox', { columns: ['status', 'receivedAt'] }],
    ['lease', { columns: ['status', 'claimedAt'] }],
    ['connection_received', { columns: ['connection', 'receivedAt'] }],
    ['retention', { columns: ['status', 'processedAt'] }],
  ])

  return resource
}

/**
 * `bot-activity` — what every action did; `target` is one `jsonb` column, `ref` (the handler's opaque
 * reference) a nullable `text` column. Read newest first per scope.
 */
export const makeBotActivityResource = (
  dbAlias?: string, alias: string = RES_BOT_ACTIVITY, serviceAlias?: string
): BotActivityResource => {
  const resource = makePostgresResource<BotActivityRecord, BotActivityResource>(alias, dbAlias, serviceAlias)
  resource.schema = BotActivityRecordSchema
  declareIndexes(resource, alias, [
    ['scope_at', { columns: ['scope', 'at'] }],
    ['scope_connection_at', { columns: ['scope', 'connection', 'at'] }],
  ])

  return resource
}
