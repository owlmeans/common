import { randomUUID } from 'node:crypto'
import { AppType, makeBasicContext, type BasicConfig, type BasicContext } from '@owlmeans/context'
import { BotPlatform, BotTransport, botTextHelper, type BotSimulateInput, type BotUpdate } from '@owlmeans/bot'
import { configureLog } from '@owlmeans/log'
import {
  appendBot, botHandler, RES_BOT_ACTIVITY, RES_BOT_CONNECTION, RES_BOT_UPDATE, type BotActions,
  type BotActivityRecord, type BotConnectionRecord, type BotHandle, type BotService, type BotUpdateRecord,
} from '@owlmeans/server-bot'
import { createStaticResource } from '@owlmeans/static-resource'

// Refused actions are expected here; `LOG_LEVEL=debug bun test` shows every line.
configureLog({ level: process.env.LOG_LEVEL ?? 'error' })

export interface TestBot {
  context: BasicContext<BasicConfig>
  service: BotService
  scope: string
}

let stores = 0

/**
 * One real context per test: the three bot resources as `@owlmeans/static-resource` stores (a fresh
 * key each time), then `appendBot` — what a target's backend does with its Postgres resources.
 */
export const makeTestBot = (): TestBot => {
  const key = `bot-agent-tests-${++stores}`
  const context = makeBasicContext<BasicConfig>({ ready: false, service: 'bot-agent-tests', type: AppType.Backend, services: {} })
  context.registerResource(createStaticResource<BotConnectionRecord>(RES_BOT_CONNECTION, `${key}-connection`))
  context.registerResource(createStaticResource<BotUpdateRecord>(RES_BOT_UPDATE, `${key}-update`))
  context.registerResource(createStaticResource<BotActivityRecord>(RES_BOT_ACTIVITY, `${key}-activity`))
  const service = appendBot(context, { secret: () => 'bot-agent-tests-secret' })

  return { context, service, scope: `scope-${randomUUID()}` }
}

/** A verified MOCK connection — no network, every platform call recorded. */
export const connect = async (bot: TestBot, platform: BotPlatform = BotPlatform.Telegram): Promise<string> => {
  const saved = await bot.service.connections.save(bot.scope, { platform, label: 'Guard', transport: BotTransport.Mock })
  return (await bot.service.connections.verify(bot.scope, saved.id)).id
}

export interface Received {
  connection: string
  update: BotUpdate
  actions: BotActions
}

/**
 * A message through the platform's own path (Telegram unless `platform` says otherwise): simulated on
 * a mock connection and dispatched by the worker's runtime to `handle` — the update and the actions a
 * handler receives. `handle` runs inside the handler, as a target's would.
 */
export const receive = async (
  bot: TestBot, input: BotSimulateInput, handle?: BotHandle, platform: BotPlatform = BotPlatform.Telegram,
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
 * A WhatsApp customer's message on a verified mock connection, through server-bot's WhatsApp plugin —
 * a platform that can reply, send and react, never delete, mute or ban.
 */
export const whatsAppUpdate = async (bot: TestBot): Promise<Received> =>
  await receive(bot, { text: 'When do you open?', sender: { id: '4915550001', name: 'Ann' } }, undefined, BotPlatform.WhatsApp)

/** An application's own keyword group, as a generated handler reads it from the app's records. */
export interface KeywordGroup {
  id: string
  keywords: string[]
  instruction?: string
}

/** What a generated handler does with its groups: the ones the text matches, in the given order. */
export const matchedGroups = (text: string, groups: readonly KeywordGroup[]): KeywordGroup[] =>
  groups.filter(group => botTextHelper.matched(text, group.keywords).length > 0)
