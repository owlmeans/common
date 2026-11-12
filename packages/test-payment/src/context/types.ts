import type { MailMessage, MailerService } from '@owlmeans/mailer'
import type { Context as ApiContext } from '@owlmeans/server-api'
import type {
  CancellationEvent, Config, ConsentEvent, ConsumerRightsDef, ConsumerRightsOptions, DisputeEvent, EntitlementGrantEvent,
  GatewayServiceOptions, PaymentFailedEvent, PaymentProvider, PricingDef, RefundEvent, SubscriptionEvent, TopUpCompletion,
  UsageMeter, WithdrawalEvent,
} from '@owlmeans/server-payment'
import type { MemoryStore } from '../memory/types.js'
import type { FakePaygate } from '../paygate/types.js'
import type { CatalogueOptions } from '../types.js'

export interface FakeContextOptions {
  catalogue?: CatalogueOptions
  /** Declare the catalogue yourself instead. */
  declare?: (cfg: Config) => void
  /** Further declarations after the catalogue (a provider's own records). */
  configure?: (cfg: Config) => void
  /** This process's `cfg.service` (default `app`). */
  service?: string
  /** The public host of this process's service (default `api.example.com`). */
  host?: string
  /** The base path of this process's service (default none). */
  base?: string
  /** Further backend services by alias, each on its own host (and base). */
  services?: Record<string, { host: string, base?: string }>
  pricing?: PricingDef
  /** Rows each store (by resource alias) holds before the context initializes — a shared database. */
  seed?: Record<string, Array<Record<string, any>>>
  /** Declare a consumer-rights policy (with trader and mail options). */
  consumerRights?: ConsumerRightsDef
  /** The consumer-rights usage meter. */
  meter?: UsageMeter
  /** Register a console mailer under `MAILER_SERVICE` (default true). */
  mailer?: boolean
  /** Register the gateway before the application's consumer-rights call (default: after). */
  gatewayFirst?: boolean
  /** The application's consumer-rights options (default: managed, with `meter`). */
  rights?: () => ConsumerRightsOptions
  /** The gateway's options (default `{ manage: false }`). */
  gateway?: GatewayServiceOptions
  /**
   * The payment providers registered before the gateway. Default: one fake paygate (`makeFakePaygate()`,
   * returned as `paygate`); `[]` registers none.
   */
  providers?: PaymentProvider[]
  /** Run on the context after the registrations, before it is configured and initialized. */
  wire?: (ctx: ApiContext) => void
}

export interface Observed {
  topUp: TopUpCompletion[]
  subscription: SubscriptionEvent[]
  refund: RefundEvent[]
  dispute: DisputeEvent[]
  paymentFailed: PaymentFailedEvent[]
  consent: ConsentEvent[]
  withdrawal: WithdrawalEvent[]
  cancellation: CancellationEvent[]
  grant: EntitlementGrantEvent[]
  /** Throw from the next `n` subscription callbacks. */
  failSubscription: number
  failTopUp: number
  failWithdrawal: number
  /** Throw from the next `n` entitlement grant callbacks. */
  failGrant: number
  /** Run inside every top-up / subscription callback, before it records the event. */
  onTopUp?: (event: TopUpCompletion) => Promise<void>
  onSubscription?: (event: SubscriptionEvent) => Promise<void>
}

/** A console mailer whose sent messages are captured — replace its `send` to simulate a transport failure. */
export interface CapturingMailer extends MailerService {
  captured: MailMessage[]
}

export interface FakeContext {
  ctx: ApiContext
  stores: Record<string, MemoryStore>
  observed: Observed
  /** Every mail the console mailer took. */
  mails: MailMessage[]
  mailer: CapturingMailer
  /** The default fake paygate — absent when `providers` was given. */
  paygate?: FakePaygate
}
