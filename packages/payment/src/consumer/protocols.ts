import { contract, openProtocol, protocol, typed, type EntrypointProtocol, type OpenRequest, type OpenValue } from '@owlmeans/entrypoint'
import { backend, frontend, route, RouteMethod } from '@owlmeans/route'
import {
  BillingProfileViewSchema, CancellationBodySchema, CancellationReceiptSchema, ConsumerRightsPublicViewSchema,
  DeclarationReceiptSchema, PerformanceConsentBodySchema, PerformanceConsentResponseSchema,
  PerformanceConsentViewSchema, PurchaseListSchema, SubscriptionStartBodySchema, SubscriptionStartQuerySchema,
  SubscriptionStartResponseSchema, SubscriptionStartViewSchema, WithdrawalBodySchema,
  WithdrawalCandidateListSchema, WithdrawalReceiptSchema,
} from '../model/consumer.js'
import type { SubscriptionStartQuery } from '../types.js'
import { CONSUMER_RIGHTS_API_PATH, CONSUMER_RIGHTS_CANCELLATION_SCREEN_PATH, CONSUMER_RIGHTS_PUBLIC_PATH, CONSUMER_RIGHTS_WITHDRAWAL_SCREEN_PATH } from './consts.js'
import type { ConsumerRightsAccountProtocols, ConsumerRightsProtocolOptions, ConsumerRightsProtocols, ConsumerRightsPublicProtocols, ConsumerRightsScreens } from './types.js'


const get = (alias: string, path: string, parent: EntrypointProtocol<OpenRequest, OpenValue>) =>
  route(alias, path, backend({ parent, method: RouteMethod.GET }))

const post = (alias: string, path: string, parent: EntrypointProtocol<OpenRequest, OpenValue>) =>
  route(alias, path, backend({ parent, method: RouteMethod.POST }))

/**
 * The standard consumer-rights protocol tree, the way `makeMarketingConsentProtocols` builds
 * its own:
 *
 * - `base` under the application's guarded `parent` (its account base, whose guards and gate
 *   every route inherits) with `profile` GET `/profile`, `purchases` GET `/purchases`, `consent`
 *   GET / `giveConsent` POST `/consent`, `start` GET `/start?planSku` / `requestStart` POST
 *   `/start`, `withdrawals` GET / `withdraw` POST `/withdrawal`, `cancel` POST `/cancellation`;
 * - with `public`, an UNGUARDED `public` subtree — `policy` GET `/policy`, `withdraw` POST
 *   `/withdrawal`, `cancel` POST `/cancellation` — like `paymentGate.webhook`, plus optional
 *   sticky frontend `screens`.
 *
 * Aliases are `<prefix>:<name>` (`<prefix>:public:<name>` below `public`). A tree with neither a
 * parent nor guards is a declaration error: the account routes act on the caller's own records.
 * Absent parts are left out of the tree rather than set to `undefined`, so `protocols(tree)` and
 * `mapProtocols(tree, …)` walk it as is.
 */
export const makeConsumerRightsProtocols = <O extends ConsumerRightsProtocolOptions>(opts: O): ConsumerRightsProtocols<O> => {
  if (opts.parent == null && opts.guards == null) {
    throw new SyntaxError('consumer-rights: the account routes need either a parent or explicit guards')
  }
  const alias = (name: string): string => `${opts.prefix}:${name}`
  const path = opts.path ?? CONSUMER_RIGHTS_API_PATH

  const base = opts.parent != null
    ? openProtocol(route(alias('base'), path, backend({ parent: opts.parent })))
    : openProtocol(route(alias('base'), path, backend()), {
        guards: opts.guards,
        ...(opts.gate != null ? { gate: opts.gate } : {}),
      })

  const account: ConsumerRightsAccountProtocols = {
    base,
    profile: protocol(get(alias('profile'), '/profile', base), contract(BillingProfileViewSchema)),
    purchases: protocol(get(alias('purchases'), '/purchases', base), contract(PurchaseListSchema)),
    consent: protocol(get(alias('consent'), '/consent', base), contract(PerformanceConsentViewSchema)),
    giveConsent: protocol(
      post(alias('consent:give'), '/consent', base),
      contract(PerformanceConsentBodySchema, PerformanceConsentResponseSchema),
    ),
    start: protocol(
      get(alias('start'), '/start', base),
      contract.request({ query: typed<SubscriptionStartQuery>(SubscriptionStartQuerySchema) }, SubscriptionStartViewSchema),
    ),
    requestStart: protocol(
      post(alias('start:request'), '/start', base),
      contract(SubscriptionStartBodySchema, SubscriptionStartResponseSchema),
    ),
    withdrawals: protocol(get(alias('withdrawals'), '/withdrawal', base), contract(WithdrawalCandidateListSchema)),
    withdraw: protocol(
      post(alias('withdraw'), '/withdrawal', base),
      contract(WithdrawalBodySchema, WithdrawalReceiptSchema),
    ),
    cancel: protocol(
      post(alias('cancel'), '/cancellation', base),
      contract(CancellationBodySchema, CancellationReceiptSchema),
    ),
  }
  if (opts.public == null || opts.public === false) {
    return account as ConsumerRightsProtocols<O>
  }

  const pub = opts.public
  const publicAlias = (name: string): string => alias(`public:${name}`)
  const publicBase = openProtocol(route(
    publicAlias('base'), pub.path ?? CONSUMER_RIGHTS_PUBLIC_PATH, backend(pub.parent != null ? { parent: pub.parent } : null),
  ))
  const publicTree: ConsumerRightsPublicProtocols = {
    base: publicBase,
    policy: protocol(get(publicAlias('policy'), '/policy', publicBase), contract(ConsumerRightsPublicViewSchema)),
    withdraw: protocol(
      post(publicAlias('withdraw'), '/withdrawal', publicBase),
      contract(WithdrawalBodySchema, DeclarationReceiptSchema),
    ),
    cancel: protocol(
      post(publicAlias('cancel'), '/cancellation', publicBase),
      contract(CancellationBodySchema, DeclarationReceiptSchema),
    ),
  }
  const screens = pub.screens == null ? {} : {
    screens: {
      // Top-level frontend screens, `sticky` so the router keeps them regardless of `cfg.service`
      // filtering — the same shape as every other legal page.
      withdrawal: openProtocol(route(
        publicAlias('screen:withdrawal'), pub.screens.withdrawal ?? CONSUMER_RIGHTS_WITHDRAWAL_SCREEN_PATH,
        frontend({ parent: pub.screens.parent }),
      ), { sticky: true }),
      cancellation: openProtocol(route(
        publicAlias('screen:cancellation'), pub.screens.cancellation ?? CONSUMER_RIGHTS_CANCELLATION_SCREEN_PATH,
        frontend({ parent: pub.screens.parent }),
      ), { sticky: true }),
    } satisfies ConsumerRightsScreens,
  }

  return { ...account, public: { ...publicTree, ...screens } } as unknown as ConsumerRightsProtocols<O>
}
