import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { Resource } from '@owlmeans/resource'
import { RES_BOT_ACTIVITY, RES_BOT_CONNECTION, RES_BOT_RULE, RES_BOT_UPDATE } from '../consts.js'
import type { BotActivityRecord, BotConnectionRecord, BotResourceAliases, BotRuleRecord, BotUpdateRecord } from '../types.js'
import type { BotStore } from './types.local.js'

/** The four resources by alias — looked up per call, so registration order against the service is free. */
export const makeBotStore = (context: () => BasicContext<BasicConfig>, aliases: BotResourceAliases = {}): BotStore => ({
  connections: () => context().resource<Resource<BotConnectionRecord>>(aliases.connection ?? RES_BOT_CONNECTION),
  rules: () => context().resource<Resource<BotRuleRecord>>(aliases.rule ?? RES_BOT_RULE),
  updates: () => context().resource<Resource<BotUpdateRecord>>(aliases.update ?? RES_BOT_UPDATE),
  activities: () => context().resource<Resource<BotActivityRecord>>(aliases.activity ?? RES_BOT_ACTIVITY),
})
