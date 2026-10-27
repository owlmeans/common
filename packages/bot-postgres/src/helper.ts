import type { BasicContext } from '@owlmeans/context'
import { RES_BOT_ACTIVITY, RES_BOT_CONNECTION, RES_BOT_RULE, RES_BOT_UPDATE } from '@owlmeans/server-bot'

import {
  makeBotActivityResource, makeBotConnectionResource, makeBotRuleResource, makeBotUpdateResource,
} from './resource.js'
import type { BotPostgresOptions } from './types.js'

/**
 * Registers the four bot resources, each only while its alias is free — a second call (a context
 * composed in two places, a hot reload) leaves the registered ones alone. Registration order against
 * `appendBot` is free: the service resolves its resources by alias on every call.
 */
export const appendPostgresBot = (ctx: BasicContext<any>, opts: BotPostgresOptions = {}): void => {
  const { dbAlias, serviceAlias, resources = {} } = opts
  const connection = resources.connection ?? RES_BOT_CONNECTION
  const rule = resources.rule ?? RES_BOT_RULE
  const update = resources.update ?? RES_BOT_UPDATE
  const activity = resources.activity ?? RES_BOT_ACTIVITY

  if (!ctx.hasResource(connection)) {
    ctx.registerResource(makeBotConnectionResource(dbAlias, connection, serviceAlias))
  }
  if (!ctx.hasResource(rule)) {
    ctx.registerResource(makeBotRuleResource(dbAlias, rule, serviceAlias))
  }
  if (!ctx.hasResource(update)) {
    ctx.registerResource(makeBotUpdateResource(dbAlias, update, serviceAlias))
  }
  if (!ctx.hasResource(activity)) {
    ctx.registerResource(makeBotActivityResource(dbAlias, activity, serviceAlias))
  }
}
