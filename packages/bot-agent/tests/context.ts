import { randomUUID } from 'node:crypto'
import { AppType, makeBasicContext, type BasicConfig, type BasicContext } from '@owlmeans/context'
import { BotActionKind, BotTransport, botTextHelper, type BotSimulateInput, type BotUpdate } from '@owlmeans/bot'
import { configureLog } from '@owlmeans/log'
import {
  appendBot, botHandler, RES_BOT_ACTIVITY, RES_BOT_CONNECTION, RES_BOT_UPDATE, type BotActions,
  type BotActivityRecord, type BotConnectionRecord, type BotHandle, type BotService, type BotUpdateRecord,
  type BotPlatformPlugin,
} from '@owlmeans/server-bot'
import { makeTestBotPlatform } from '@owlmeans/server-bot/mock'
import { createStaticResource } from '@owlmeans/static-resource'

// Refused actions are expected here; `LOG_LEVEL=debug bun test` shows every line.
configureLog({ level: process.env.LOG_LEVEL ?? 'error' })

export interface TestBot {
  context: BasicContext<BasicConfig>
  service: BotService
  scope: string
  /** `community` (every action) and `shop` (reply, send, react — never delete, mute or ban), fresh per bot. */
  platforms: { community: BotPlatformPlugin, shop: BotPlatformPlugin }
}

/** The platform every helper connects on unless told otherwise. */
export const COMMUNITY = 'community'
/** A platform that can reply, send and react, never delete, mute or ban. */
export const SHOP = 'shop'

let stores = 0

/**
 * One real context per test: the three bot resources as `@owlmeans/static-resource` stores (a fresh
 * key each time), then `appendBot` with two test platforms — what a target's backend does with its
 * Postgres resources and its platform plugins.
 */
export const makeTestBot = (): TestBot => {
  const key = `bot-agent-tests-${++stores}`
  const context = makeBasicContext<BasicConfig>({ ready: false, service: 'bot-agent-tests', type: AppType.Backend, services: {} })
  context.registerResource(createStaticResource<BotConnectionRecord>(RES_BOT_CONNECTION, `${key}-connection`))
  context.registerResource(createStaticResource<BotUpdateRecord>(RES_BOT_UPDATE, `${key}-update`))
  context.registerResource(createStaticResource<BotActivityRecord>(RES_BOT_ACTIVITY, `${key}-activity`))
  const platforms = {
    community: makeTestBotPlatform({ platform: COMMUNITY, title: 'Community' }),
    shop: makeTestBotPlatform({
      platform: SHOP, title: 'Shop', actions: [BotActionKind.Reply, BotActionKind.Send, BotActionKind.React],
    }),
  }
  const service = appendBot(context, {
    secret: () => 'bot-agent-tests-secret', platforms: [platforms.community, platforms.shop],
  })

  return { context, service, scope: `scope-${randomUUID()}`, platforms }
}

/** A verified MOCK connection — no network, every platform call recorded. */
export const connect = async (bot: TestBot, platform: string = COMMUNITY): Promise<string> => {
  const saved = await bot.service.connections.save(bot.scope, { platform, label: 'Guard', transport: BotTransport.Mock })
  return (await bot.service.connections.verify(bot.scope, saved.id)).id
}

export interface Received {
  connection: string
  update: BotUpdate
  actions: BotActions
}

/**
 * A message through the platform's own path (`community` unless `platform` says otherwise): simulated on
 * a mock connection and dispatched by the worker's runtime to `handle` — the update and the actions a
 * handler receives. `handle` runs inside the handler, as a target's would.
 */
export const receive = async (
  bot: TestBot, input: BotSimulateInput, handle?: BotHandle, platform: string = COMMUNITY,
): Promise<Received> => {
  const connection = await connect(bot, platform)
  let received: Received | null = null
  const runtime = bot.service.runtime([botHandler('agent', async (update, actions, context) => {
    received = { connection, update, actions }
    await handle?.(update, actions, context)
  })])
  await bot.service.simulate(bot.scope, connection, input)
  await runtime.dispatch()
  await runtime.stop()
  if (received == null) {
    throw new Error('the simulated message was not dispatched')
  }

  return received
}

/**
 * A customer's message on a verified mock connection of `shop` — a platform that can reply, send
 * and react, never delete, mute or ban.
 */
export const shopUpdate = async (bot: TestBot): Promise<Received> =>
  await receive(bot, { text: 'When do you open?', sender: { id: '4915550001', name: 'Ann' } }, undefined, SHOP)

/** An application's own keyword group, as a generated handler reads it from the app's records. */
export interface KeywordGroup {
  id: string
  keywords: string[]
  instruction?: string
}

/** What a generated handler does with its groups: the ones the text matches, in the given order. */
export const matchedGroups = (text: string, groups: readonly KeywordGroup[]): KeywordGroup[] =>
  groups.filter(group => botTextHelper.matched(text, group.keywords).length > 0)
