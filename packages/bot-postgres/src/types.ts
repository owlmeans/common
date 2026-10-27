import type { PostgresResource } from '@owlmeans/postgres-resource'
import type { BotActivityRecord, BotConnectionRecord, BotResourceAliases, BotUpdateRecord } from '@owlmeans/server-bot'

/** `bot-connection` — one row per connected bot, its credentials sealed in one text column. */
export interface BotConnectionResource extends PostgresResource<BotConnectionRecord> {}

/** `bot-update` — the inbox: one row per inbound platform update, unique by its `dedupe` key. */
export interface BotUpdateResource extends PostgresResource<BotUpdateRecord> {}

/** `bot-activity` — one row per action a bot took (or refused), newest read first. */
export interface BotActivityResource extends PostgresResource<BotActivityRecord> {}

export interface BotPostgresOptions {
  /** The `cfg.dbs` entry the three tables live in — default `postgres`. */
  dbAlias?: string
  /** The Postgres connection service — default `postgres`. */
  serviceAlias?: string
  /**
   * The resources' aliases — default `bot-connection`, `bot-update`, `bot-activity`.
   * The bot service must be given the same ones (`appendBot(ctx, { resources })`).
   */
  resources?: BotResourceAliases
}
