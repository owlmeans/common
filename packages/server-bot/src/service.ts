import { createLazyService, type BasicConfig, type BasicContext } from '@owlmeans/context'
import { logger } from '@owlmeans/log'
import {
  BOT_ATTEMPTS, BOT_LEASE_MS, BOT_POLL_MS, BOT_RECONCILE_MS, BOT_RETAIN_MS, BOT_SECRET_ENV, BOT_SERVICE,
} from './consts.js'
import { botOriginHelper } from './helpers/origin.js'
import { BOT_BUILTIN_PLATFORMS } from './platforms/consts.js'
import { makeBotPlatformRegistry } from './platforms/registry.js'
import type { BotFetch } from './platforms/types.js'
import { makeBotActionsFactory } from './service/actions.js'
import { makeBotActivity } from './service/activity.js'
import { makeBotConnections } from './service/connections.js'
import { makeBotInbox } from './service/inbox.js'
import { makeBotRules } from './service/rules.js'
import { makeBotRuntimeFactory } from './service/runtime.js'
import { makeBotSessions } from './service/sessions.js'
import { makeBotStore } from './service/store.js'
import type { BotResolvedOptions, BotServiceParts } from './service/types.local.js'
import type { BotService, BotServiceOptions } from './types.js'

const positive = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback

/**
 * The bot service over any `@owlmeans/resource` store: connections (credentials sealed), rules,
 * activity, the signed inbound hook into the inbox, simulation for mock connections, the worker's
 * runtime and the never-throwing actions. Resources are resolved by alias on every call.
 */
export const makeBotService = (options: BotServiceOptions = {}, alias: string = BOT_SERVICE): BotService => {
  const resolved: BotResolvedOptions = {
    hookUrl: options.hookUrl ?? botOriginHelper.hookUrl,
    fetch: () => options.fetch ?? (globalThis.fetch as unknown as BotFetch),
    secret: () => options.secret != null ? options.secret() : process.env[BOT_SECRET_ENV],
    pollMs: positive(options.pollMs, BOT_POLL_MS),
    reconcileMs: positive(options.reconcileMs, BOT_RECONCILE_MS),
    attempts: Math.trunc(positive(options.attempts, BOT_ATTEMPTS)),
    leaseMs: positive(options.leaseMs, BOT_LEASE_MS),
    retainMs: options.retainMs === 0 ? 0 : positive(options.retainMs, BOT_RETAIN_MS),
  }

  let service: BotService | undefined
  const parts: BotServiceParts = {
    context: () => service!.assertCtx<BasicConfig, BasicContext<BasicConfig>>(alias),
    store: makeBotStore(() => service!.assertCtx<BasicConfig, BasicContext<BasicConfig>>(alias), options.resources),
    registry: makeBotPlatformRegistry(options.platforms ?? BOT_BUILTIN_PLATFORMS),
    options: resolved,
    now: options.now ?? (() => new Date()),
    log: logger('server-bot'),
  }
  const sessions = makeBotSessions(parts)
  const activity = makeBotActivity(parts)
  const inbox = makeBotInbox(parts, sessions)
  const actions = makeBotActionsFactory(parts, sessions, activity)

  service = createLazyService<BotService>(alias, {
    connections: makeBotConnections(parts, sessions),
    rules: makeBotRules(parts, sessions),
    activity: { list: activity.list },
    receive: inbox.receive,
    simulate: inbox.simulate,
    runtime: makeBotRuntimeFactory(parts, sessions, inbox, actions).runtime,
    actions: actions.actions,
  })

  return service
}

/**
 * Register the bot service (unless the alias is taken — then that one is answered) and return it.
 * The four resources are registered separately (`@owlmeans/bot-postgres`, or any `Resource`).
 */
export const appendBot = <C extends BasicContext<any>>(
  context: C, options?: BotServiceOptions, alias: string = BOT_SERVICE
): BotService => {
  if (!context.hasService(alias)) {
    context.registerService(makeBotService(options, alias))
  }

  return context.service<BotService>(alias)
}
