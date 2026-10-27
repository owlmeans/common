import { randomUUID } from 'node:crypto'
import { AppType, makeBasicContext, type BasicConfig, type BasicContext } from '@owlmeans/context'
import type { Resource } from '@owlmeans/resource'
import { createStaticResource } from '@owlmeans/static-resource'
import { configureLog } from '@owlmeans/log'
import { RES_BOT_ACTIVITY, RES_BOT_CONNECTION, RES_BOT_RULE, RES_BOT_UPDATE } from '../src/consts.js'
import { appendBot } from '../src/service.js'
import type {
  BotActivityRecord, BotConnectionRecord, BotRuleRecord, BotService, BotServiceOptions, BotUpdateRecord,
} from '../src/types.js'

export const SECRET = 'server-bot-tests-secret'

// Refusals and handler failures are expected here; `LOG_LEVEL=debug bun test` shows every line.
configureLog({ level: process.env.LOG_LEVEL ?? 'error' })

export interface TestBot {
  /** The store key: another `makeTestBot(options, store)` reads and writes the same rows (a restart). */
  store: string
  context: BasicContext<BasicConfig>
  service: BotService
  connections: Resource<BotConnectionRecord>
  rules: Resource<BotRuleRecord>
  updates: Resource<BotUpdateRecord>
  activities: Resource<BotActivityRecord>
}

let stores = 0

/**
 * One real context per test: the four resources as `@owlmeans/static-resource` stores (a fresh key
 * each time, so tests never share rows — unless `store` names an earlier bot's, which is that bot's
 * process restarted), then `appendBot` — what a target's backend does with its Postgres resources.
 * A fast dispatcher; the secret is a fixture.
 */
export const makeTestBot = (options: BotServiceOptions = {}, store?: string): TestBot => {
  const key = store ?? `server-bot-tests-${++stores}`
  const context = makeBasicContext<BasicConfig>({ ready: false, service: 'server-bot-tests', type: AppType.Backend, services: {} })
  const connections = createStaticResource<BotConnectionRecord>(RES_BOT_CONNECTION, `${key}-connection`)
  const rules = createStaticResource<BotRuleRecord>(RES_BOT_RULE, `${key}-rule`)
  const updates = createStaticResource<BotUpdateRecord>(RES_BOT_UPDATE, `${key}-update`)
  const activities = createStaticResource<BotActivityRecord>(RES_BOT_ACTIVITY, `${key}-activity`)
  context.registerResource(connections)
  context.registerResource(rules)
  context.registerResource(updates)
  context.registerResource(activities)
  const service = appendBot(context, { secret: () => SECRET, pollMs: 5, reconcileMs: 20, ...options })

  return { store: key, context, service, connections, rules, updates, activities }
}

export const scopeOf = (): string => `scope-${randomUUID()}`

/** A response the bound handler resolves or rejects — the smallest the transport needs. */
export const invoke = async (entrypoint: object, request: Record<string, unknown>): Promise<any> => {
  const response: any = {
    resolve: (value: unknown) => { response.value = value },
    reject: (error: Error) => { response.error = error },
  }
  await (entrypoint as { handle: (req: unknown, res: unknown) => Promise<unknown> }).handle({
    alias: 'test', headers: {}, params: {}, query: {}, body: {}, path: '/', ...request,
  }, response)
  if (response.error != null) {
    throw response.error
  }

  return response.value
}

export const sleep = async (ms: number): Promise<void> => { await new Promise(resolve => setTimeout(resolve, ms)) }

/** Poll until `probe` holds (or fail after `timeoutMs`). */
export const until = async (probe: () => Promise<boolean>, timeoutMs: number = 3_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probe()) {
      return
    }
    await sleep(10)
  }
  throw new Error('condition not reached')
}
