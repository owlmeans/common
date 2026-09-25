import { mongoGate, randomNamespace } from '@owlmeans/test-integration'
import type { IntegrationGate, MongoEnv } from '@owlmeans/test-integration'
import { AppType } from '@owlmeans/context'
import { appendMongo } from '@owlmeans/mongo'
import type { MongoDbService } from '@owlmeans/mongo-resource'
import { LimitKind, LimitWindow, PlanDuration } from '@owlmeans/payment'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig } from '@owlmeans/server-context'
import type { Context as ApiContext } from '@owlmeans/server-api'
import type Stripe from 'stripe'
import { declareConsumerRights, declarePaymentPricing } from '../src/config.js'
import { appendConsumerRights } from '../src/consumer/service.js'
import { appendPaymentGatewayService } from '../src/service.js'
import type { Config, ConsumerRightsDef, PricingDef, UsageMeter } from '../src/types.js'
import { declareTestCatalogue, HOST, PLANS_PRODUCT, SERVICE } from './fake-stripe.js'

/**
 * Category-C harness: a real server context over a real Mongo database — the payment resources with
 * their validators and indexes, the entitlement service and the gates — with the gateway unmanaged
 * (no Stripe). One database per spec file, dropped by that file's own teardown.
 */
export const gate: IntegrationGate<MongoEnv> = mongoGate()

export const BURST_PLAN = 'burst-plan'

export interface Booted {
  ctx: ApiContext
  mongo: MongoDbService
}

export interface MongoSuite {
  database: string
  boot: () => Promise<Booted>
  teardown: () => Promise<void>
}

export interface SuiteOptions {
  consumerRights?: ConsumerRightsDef
  pricing?: PricingDef
  /** The paygate the consumer-rights service manages (a fake); without it the service is unmanaged. */
  stripe?: Stripe
  meter?: UsageMeter
}

export const makeSuite = (label: string, opts: SuiteOptions = {}): MongoSuite => {
  const prefix = process.env.MONGO_TEST_DB_PREFIX ?? 'omt'
  const database = randomNamespace(`${prefix}_${label}`)
  const booted: MongoDbService[] = []

  const boot = async (): Promise<Booted> => {
    const parsed = new URL(gate.env.MONGO_URL as string)
    const cfg = config<ServerConfig>(SERVICE, {
      dbs: [{
        service: 'mongo', alias: 'mongo', schema: database,
        host: decodeURIComponent(parsed.hostname).replace(/^\[|\]$/g, ''),
        port: parsed.port !== '' ? parseInt(parsed.port, 10) : 27017,
        ...(parsed.username !== ''
          ? { user: decodeURIComponent(parsed.username), secret: decodeURIComponent(parsed.password) }
          : {}),
      }],
      services: { [SERVICE]: { service: SERVICE, type: AppType.Backend, host: HOST } },
    } as Partial<ServerConfig>)
    declareTestCatalogue(cfg as unknown as Config, {
      plans: [{
        productSku: PLANS_PRODUCT, sku: BURST_PLAN, duration: PlanDuration.Monthly, rank: 30, price: 90,
        recurring: { interval: 'month' },
        limits: {
          burst: { kind: LimitKind.Window, window: LimitWindow.Day, limit: 5 },
          seats: { kind: LimitKind.Occupancy, limit: 1 },
        },
      }],
    })

    if (opts.pricing != null) declarePaymentPricing(cfg as unknown as Config, opts.pricing)
    if (opts.consumerRights != null) declareConsumerRights(cfg as unknown as Config, opts.consumerRights)

    const context = makeServerContext(cfg)
    appendMongo(context)
    if (opts.stripe != null) {
      const stripe = opts.stripe
      appendConsumerRights(context as never, { manage: true, stripe: async () => stripe, ...(opts.meter != null ? { usage: opts.meter } : {}) })
    }
    appendPaymentGatewayService(context as never, { manage: false })
    context.configure()
    const mongo = context.service<MongoDbService>('mongo')
    booted.push(mongo)
    await context.init()

    return { ctx: context as unknown as ApiContext, mongo }
  }

  const teardown = async (): Promise<void> => {
    if (gate.skip) {
      return
    }
    const [first] = booted
    if (first != null) {
      await first.db().then(async db => { await db.dropDatabase() })
        .catch(error => console.error(`mongo test teardown (${database}):`, error))
    }
    for (const mongo of booted) {
      for (const client of Object.values(mongo.clients ?? {}) as Array<{ close: () => Promise<void> }>) {
        await client.close().catch(() => undefined)
      }
    }
  }

  return { database, boot, teardown }
}
