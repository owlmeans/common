import type { JSONSchemaType } from 'ajv'
import type { PricingPolicy } from './types.js'

export enum ProductType {
  Simple = 'simple',
  Service = 'service',
  Consumable = 'consumable'
}

export enum CheckoutPricingMode {
  Quantity = 'quantity',
  Amount = 'amount',
}

export enum PaymentEntityType {
  Product = 'product',
  Plan = 'plan',
  CapabilitySet = 'capability-set',
}

export enum PlanStatus {
  Active = 'active',
  Custom = 'custom',
  Hidden = 'hidden',
  Archived = 'archived',
  Deprecated = 'deprecated',
  Suspended = 'suspended'
}

export enum PlanDuration {
  Monthly = 'monthly',
  Yearly = 'yearly',
  Lifetime = 'lifetime',
  Reusable = 'reusable',
  /**
   * It means it requires some tokens to be consumed to use the 
   * capability.
   */
  Consumable = 'consumable'
}

export enum SubscriptionStatus {
  Created = 'created',
  Trial = 'trial',
  Canceled = 'canceled',
  Expired = 'expired',
  /** Revoked until resumed: unpaid, paused, or collection paused. */
  Suspended = 'suspended',
  Blocked = 'blocked',
  Ended = 'ended',
  Active = 'active',
  /** Payment failed and is being retried: still entitled, flagged. */
  PastDue = 'past-due',
}

/** The statuses that grant a plan's capabilities and limits. */
export const ENTITLING_STATUSES: readonly SubscriptionStatus[] = Object.freeze([
  SubscriptionStatus.Active, SubscriptionStatus.Trial, SubscriptionStatus.PastDue,
])

/** The statuses a subscription never leaves on its own. */
export const TERMINAL_STATUSES: readonly SubscriptionStatus[] = Object.freeze([
  SubscriptionStatus.Canceled, SubscriptionStatus.Expired, SubscriptionStatus.Ended,
  SubscriptionStatus.Blocked,
])

/** How a limit's counter renews. */
export enum LimitKind {
  /** Renews on a calendar UTC window (`LimitWindow`). */
  Window = 'window',
  /** Never renews: the counter belongs to the entity and survives plan changes. */
  Lifetime = 'lifetime',
  /** A held count (`+1` on acquire, `-1` on release), reconciled against reality. */
  Occupancy = 'occupancy',
}

/** The calendar UTC window of a `LimitKind.Window` limit. */
export enum LimitWindow {
  Day = 'day',
  Month = 'month',
}

/** Which paygate portal flow a portal link opens. */
export enum PortalFlow {
  Manage = 'manage',
  Cancel = 'cancel',
  Update = 'update',
  Change = 'change',
  PaymentMethod = 'payment-method',
}

/** Whether a price's amount includes tax, or tax is added on top — never inferred, always declared. */
export enum TaxBehavior {
  Exclusive = 'exclusive',
  Inclusive = 'inclusive',
}

/** What a price estimate says about tax at one billing country. */
export enum TaxEstimateStatus {
  /** Tax is due and its rate(s) are in `TaxEstimate.rates`. */
  Taxed = 'taxed',
  /** No tax because the buyer's tax id shifts liability to them (EU/GB reverse charge). */
  ReverseCharge = 'reverse-charge',
  /** No tax for any other reason (not registered there, exempt, zero-rated). */
  None = 'none',
  /** The gateway could not resolve a rate from what it was given; the real total shows at checkout. */
  AtCheckout = 'at-checkout',
  /** No country was given and none could be inferred from the entity's paygate customer. */
  LocationRequired = 'location-required',
}

/** A tax type a rate carries, collapsed from Stripe's finer `tax_type` for display. */
export enum TaxType {
  Vat = 'vat',
  Gst = 'gst',
  SalesTax = 'sales-tax',
  /** Any other Stripe `tax_type` (excise, lease, tourism, …). */
  Tax = 'tax',
}

/** The paygate alias of subscriptions the application grants itself (a free plan, a comp). */
export const INTERNAL_PAYGATE = 'internal'

/**
 * Where a billing country sits for consumer rights and the charge currency: inside the declared
 * consumer-rights territories (`ConsumerRightsPolicy.countries`) or outside them.
 */
export enum ConsumerRegion {
  Eu = 'eu',
  Other = 'other',
}

/** What a purchase — a window of the right of withdrawal — was. */
export enum PurchaseKind {
  /** A paid one-time checkout of an amount or quantity plan (prepaid credits). */
  TopUp = 'top-up',
  /** The FIRST invoice of a subscription. Renewals are not purchases. */
  Subscription = 'subscription',
}

/** What a consumer expressly requested. */
export enum ConsentKind {
  /** Start performing now, before the withdrawal period of a credit purchase ends. */
  Performance = 'performance',
  /** Start a subscription's services now — given before its checkout. */
  SubscriptionStart = 'subscription-start',
}

/** What a consumer declared through a statutory function. */
export enum DeclarationKind {
  Withdrawal = 'withdrawal',
  Cancellation = 'cancellation',
}

/** Where a declaration was made: signed in, or through the public page without a login. */
export enum DeclarationChannel {
  InApp = 'in-app',
  Public = 'public',
}

export enum CancellationKind {
  Ordinary = 'ordinary',
  /** For cause; carries a reason. */
  Extraordinary = 'extraordinary',
}

export enum WithdrawalStatus {
  /** Recorded; nothing is disclosed yet (a public declaration always answers this). */
  Received = 'received',
  Processing = 'processing',
  Refunded = 'refunded',
  /** Recorded, and left to an operator: no usage meter, or automatic refunds are off. */
  Review = 'review',
  Failed = 'failed',
  /** Received after the withdrawal period ended; recorded, not executed. */
  Expired = 'expired',
}

export enum CancellationStatus {
  Received = 'received',
  Scheduled = 'scheduled',
  AlreadyScheduled = 'already-scheduled',
  /** Recorded and left to an operator — an extraordinary cancellation (for cause). */
  Review = 'review',
}

export enum WithdrawalUnavailableReason {
  NotInScope = 'not-in-scope',
  Expired = 'expired',
  Withdrawn = 'withdrawn',
  /** Fully performed after consent: the right of withdrawal has expired, nothing would be reimbursed. */
  Performed = 'performed',
  Unknown = 'unknown',
}

export enum CancellationUnavailableReason {
  NoSubscription = 'no-subscription',
  Ended = 'ended',
}

export const ConsumerRegionSchema: JSONSchemaType<ConsumerRegion> = {
  type: 'string',
  enum: Object.values(ConsumerRegion),
}

export const PurchaseKindSchema: JSONSchemaType<PurchaseKind> = {
  type: 'string',
  enum: Object.values(PurchaseKind),
}

export const ConsentKindSchema: JSONSchemaType<ConsentKind> = {
  type: 'string',
  enum: Object.values(ConsentKind),
}

export const DeclarationKindSchema: JSONSchemaType<DeclarationKind> = {
  type: 'string',
  enum: Object.values(DeclarationKind),
}

export const DeclarationChannelSchema: JSONSchemaType<DeclarationChannel> = {
  type: 'string',
  enum: Object.values(DeclarationChannel),
}

export const CancellationKindSchema: JSONSchemaType<CancellationKind> = {
  type: 'string',
  enum: Object.values(CancellationKind),
}

export const WithdrawalStatusSchema: JSONSchemaType<WithdrawalStatus> = {
  type: 'string',
  enum: Object.values(WithdrawalStatus),
}

export const CancellationStatusSchema: JSONSchemaType<CancellationStatus> = {
  type: 'string',
  enum: Object.values(CancellationStatus),
}

export const WithdrawalUnavailableReasonSchema: JSONSchemaType<WithdrawalUnavailableReason> = {
  type: 'string',
  enum: Object.values(WithdrawalUnavailableReason),
}

export const CancellationUnavailableReasonSchema: JSONSchemaType<CancellationUnavailableReason> = {
  type: 'string',
  enum: Object.values(CancellationUnavailableReason),
}

export const ProductTypeSchema: JSONSchemaType<ProductType> = {
  type: 'string',
  enum: Object.values(ProductType)
}

export const CheckoutPricingModeSchema: JSONSchemaType<CheckoutPricingMode> = {
  type: 'string',
  enum: Object.values(CheckoutPricingMode),
}

export const PaymentEntityTypeSchema: JSONSchemaType<PaymentEntityType> = {
  type: 'string',
  enum: Object.values(PaymentEntityType)
}

export const PlanStatusSchema: JSONSchemaType<PlanStatus> = {
  type: 'string',
  enum: Object.values(PlanStatus)
}

export const PlanDurationSchema: JSONSchemaType<PlanDuration> = {
  type: 'string',
  enum: Object.values(PlanDuration)
}

export const SubscriptionStatusSchema: JSONSchemaType<SubscriptionStatus> = {
  type: 'string',
  enum: Object.values(SubscriptionStatus)
}

export const LimitKindSchema: JSONSchemaType<LimitKind> = {
  type: 'string',
  enum: Object.values(LimitKind)
}

export const LimitWindowSchema: JSONSchemaType<LimitWindow> = {
  type: 'string',
  enum: Object.values(LimitWindow)
}

export const PortalFlowSchema: JSONSchemaType<PortalFlow> = {
  type: 'string',
  enum: Object.values(PortalFlow)
}

export const TaxBehaviorSchema: JSONSchemaType<TaxBehavior> = {
  type: 'string',
  enum: Object.values(TaxBehavior)
}

export const TaxEstimateStatusSchema: JSONSchemaType<TaxEstimateStatus> = {
  type: 'string',
  enum: Object.values(TaxEstimateStatus)
}

export const TaxTypeSchema: JSONSchemaType<TaxType> = {
  type: 'string',
  enum: Object.values(TaxType)
}

export const ProductTitleSchema: JSONSchemaType<string> = {
  type: 'string', minLength: 1, maxLength: 128
}

export const ProductDescriptionSchema: JSONSchemaType<string> = {
  type: 'string', minLength: 0, maxLength: 1024, nullable: true
}

export const LocalizationLngSchema: JSONSchemaType<string> = {
  type: 'string', minLength: 2, maxLength: 3
}

export const PRODUCT_RECORD_TYPE = 'product'
export const PRODUCT_RECORD_PREFIX = PRODUCT_RECORD_TYPE

export const PLAN_RECORD_TYPE = 'plan'
export const PLAN_RECORD_PREFIX = PLAN_RECORD_TYPE

export const L10N_RECORD_TYPE = 'l10n'
export const L10N_RECORD_PREFIX = L10N_RECORD_TYPE

/** A singleton record: at most one per configuration, at this fixed id. */
export const PRICING_POLICY_RECORD_TYPE = 'pricing-policy'
export const PRICING_POLICY_RECORD_ID = PRICING_POLICY_RECORD_TYPE

/** A singleton record: the declared `ConsumerRightsPolicy`, at this fixed id. */
export const CONSUMER_RIGHTS_RECORD_TYPE = 'consumer-rights-policy'
export const CONSUMER_RIGHTS_RECORD_ID = CONSUMER_RIGHTS_RECORD_TYPE

/** The i18n resource (library tier, `lib` namespace) holding the consumer-rights legal copy. */
export const CONSUMER_RIGHTS_RESOURCE = 'payment-consumer-rights'

/**
 * The version of the legal copy this package ships. Bumped on ANY change to a
 * `payment-consumer-rights` bundle, so a consent recorded against an older wording is told apart.
 */
export const CONSUMER_RIGHTS_COPY_VERSION = '2026-10-04.2'

export const DEFAULT_ALIAS = 'payment'

export const PAYMENT_SERVICE = DEFAULT_ALIAS

/**
 * ISO 3166-1 alpha-2 country code → lowercase ISO 4217 currency code — the currency circulating in
 * that country, for the "≈ local total" line of a price estimate. Not a Stripe list: Stripe Tax can
 * compute a rate for a country this map has no entry for (or none at all, `location-required`), and
 * `currencyOfCountry` returning `null` just means the estimate carries no local-currency line, never
 * a rejected request.
 *
 * A territory that circulates another country's currency (Ecuador, Kosovo, Puerto Rico, …) is
 * mapped to that currency, not left out.
 */
export const COUNTRY_CURRENCIES: Readonly<Record<string, string>> = Object.freeze({
  AD: 'eur', AE: 'aed', AF: 'afn', AG: 'xcd', AI: 'xcd', AL: 'all', AM: 'amd', AO: 'aoa',
  AR: 'ars', AS: 'usd', AT: 'eur', AU: 'aud', AW: 'awg', AX: 'eur', AZ: 'azn',
  BA: 'bam', BB: 'bbd', BD: 'bdt', BE: 'eur', BF: 'xof', BG: 'bgn', BH: 'bhd', BI: 'bif',
  BJ: 'xof', BL: 'eur', BM: 'bmd', BN: 'bnd', BO: 'bob', BQ: 'usd', BR: 'brl', BS: 'bsd',
  BT: 'btn', BW: 'bwp', BY: 'byn', BZ: 'bzd',
  CA: 'cad', CD: 'cdf', CF: 'xaf', CG: 'xaf', CH: 'chf', CI: 'xof', CK: 'nzd', CL: 'clp',
  CM: 'xaf', CN: 'cny', CO: 'cop', CR: 'crc', CU: 'cup', CV: 'cve', CW: 'ang', CY: 'eur',
  CZ: 'czk',
  DE: 'eur', DJ: 'djf', DK: 'dkk', DM: 'xcd', DO: 'dop', DZ: 'dzd',
  EC: 'usd', EE: 'eur', EG: 'egp', EH: 'mad', ER: 'ern', ES: 'eur', ET: 'etb',
  FI: 'eur', FJ: 'fjd', FK: 'fkp', FM: 'usd', FO: 'dkk', FR: 'eur',
  GA: 'xaf', GB: 'gbp', GD: 'xcd', GE: 'gel', GF: 'eur', GG: 'gbp', GH: 'ghs', GI: 'gip',
  GL: 'dkk', GM: 'gmd', GN: 'gnf', GP: 'eur', GQ: 'xaf', GR: 'eur', GT: 'gtq', GU: 'usd',
  GW: 'xof', GY: 'gyd',
  HK: 'hkd', HN: 'hnl', HR: 'eur', HT: 'htg', HU: 'huf',
  ID: 'idr', IE: 'eur', IL: 'ils', IM: 'gbp', IN: 'inr', IQ: 'iqd', IR: 'irr', IS: 'isk',
  IT: 'eur',
  JE: 'gbp', JM: 'jmd', JO: 'jod', JP: 'jpy',
  KE: 'kes', KG: 'kgs', KH: 'khr', KI: 'aud', KM: 'kmf', KN: 'xcd', KP: 'kpw', KR: 'krw',
  KW: 'kwd', KY: 'kyd', KZ: 'kzt',
  LA: 'lak', LB: 'lbp', LC: 'xcd', LI: 'chf', LK: 'lkr', LR: 'lrd', LS: 'lsl', LT: 'eur',
  LU: 'eur', LV: 'eur', LY: 'lyd',
  MA: 'mad', MC: 'eur', MD: 'mdl', ME: 'eur', MF: 'eur', MG: 'mga', MH: 'usd', MK: 'mkd',
  ML: 'xof', MM: 'mmk', MN: 'mnt', MO: 'mop', MQ: 'eur', MR: 'mru', MS: 'xcd', MT: 'eur',
  MU: 'mur', MV: 'mvr', MW: 'mwk', MX: 'mxn', MY: 'myr', MZ: 'mzn',
  NA: 'nad', NC: 'xpf', NE: 'xof', NG: 'ngn', NI: 'nio', NL: 'eur', NO: 'nok', NP: 'npr',
  NR: 'aud', NU: 'nzd', NZ: 'nzd',
  OM: 'omr',
  PA: 'pab', PE: 'pen', PF: 'xpf', PG: 'pgk', PH: 'php', PK: 'pkr', PL: 'pln', PR: 'usd',
  PS: 'ils', PT: 'eur', PW: 'usd', PY: 'pyg',
  QA: 'qar',
  RE: 'eur', RO: 'ron', RS: 'rsd', RU: 'rub', RW: 'rwf',
  SA: 'sar', SB: 'sbd', SC: 'scr', SD: 'sdg', SE: 'sek', SG: 'sgd', SH: 'shp', SI: 'eur',
  SK: 'eur', SL: 'sle', SM: 'eur', SN: 'xof', SO: 'sos', SR: 'srd', SS: 'ssp', ST: 'stn',
  SV: 'usd', SX: 'ang', SY: 'syp', SZ: 'szl',
  TC: 'usd', TD: 'xaf', TG: 'xof', TH: 'thb', TJ: 'tjs', TK: 'nzd', TL: 'usd', TM: 'tmt',
  TN: 'tnd', TO: 'top', TR: 'try', TT: 'ttd', TV: 'aud', TW: 'twd', TZ: 'tzs',
  UA: 'uah', UG: 'ugx', US: 'usd', UY: 'uyu', UZ: 'uzs',
  VA: 'eur', VC: 'xcd', VE: 'ves', VG: 'usd', VI: 'usd', VN: 'vnd', VU: 'vuv',
  WF: 'xpf', WS: 'wst',
  YE: 'yer', YT: 'eur',
  ZA: 'zar', ZM: 'zmw', ZW: 'zwl',
})

/** Every country code `COUNTRY_CURRENCIES` names, sorted. */
export const COUNTRY_CODES: readonly string[] = Object.freeze(Object.keys(COUNTRY_CURRENCIES).sort())

/**
 * A permissive ISO 3166-1 alpha-2 shape (two uppercase letters) — not restricted to
 * `COUNTRY_CURRENCIES`, so a country this map cannot name a currency for is still a valid request;
 * it only loses the local-currency line of its estimate.
 */
export const CountrySchema: JSONSchemaType<string> = {
  type: 'string', pattern: '^[A-Z]{2}$',
}

/**
 * The gate alias a paid capability is asserted under.
 *
 * Distinct from `paymentGate.base` (a ROUTE id) and from the gateway service alias — three
 * different things that would otherwise all be called "payment gate".
 */
export const ENTITLEMENT_GATE = 'entitlement-gate'

/**
 * The gate alias a plan limit is asserted under (`limit:<key>[>=n]`).
 *
 * A separate alias from `ENTITLEMENT_GATE` because the framework collects an entrypoint's gates
 * per gate SERVICE: a capability requirement and a limit requirement under one alias would hide
 * each other.
 */
export const LIMIT_GATE = 'limit-gate'

/**
 * The capability scope that carries FEATURE flags.
 *
 * Kept apart from `renewable`, which carries numeric quotas that are consumed or counted. Merging
 * them would make "has one production slot left" and "may remove the platform credit" the same
 * number, and the first purchase that spent the quota would take the feature with it.
 */
export const CAPABILITY_FEATURE_SCOPE = 'feature'

/**
 * The scope RESERVED for limit parameters (`limit:<key>[>=n]`).
 *
 * Never a declarable capability scope: a plan's limits live in `ProductPlan.limits`, and a
 * capability predicate refuses any parameter under this scope, so a limit requirement can never be
 * satisfied by a capability grant.
 */
export const CAPABILITY_LIMIT_SCOPE = 'limit'

/**
 * Preserves today's fixed behavior for every consumer that declares no policy: automatic tax and
 * tax-id collection stay on for every checkout (`taxOptions` before this policy existed), no
 * `behavior` is forced onto a synced price, no Adaptive Pricing, and the estimate endpoints are off
 * (a new capability, opt-in only).
 */
export const DEFAULT_PRICING_POLICY: PricingPolicy = Object.freeze({
  tax: Object.freeze({ automatic: true, collectTaxId: true, estimate: false }),
  currency: Object.freeze({ estimate: false }),
}) as PricingPolicy

/** The window key a lifetime limit's counter lives under. */
export const LIFETIME_WINDOW = 'lifetime'

/** The window key an occupancy limit's counter lives under. */
export const OCCUPANCY_WINDOW = 'occupancy'

/** The 27 EU member states (ISO 3166-1 alpha-2; Greece is `GR`, as Stripe reports it). */
export const EU_COUNTRIES: readonly string[] = Object.freeze([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
])

/**
 * The member states plus the parts of them that carry their own ISO code — Åland (FI) and the
 * French outermost regions (French Guiana, Guadeloupe, Martinique, Réunion, Mayotte, Saint-Martin).
 * EU consumer law applies there even where EU VAT does not; the Canary Islands, Azores and Madeira
 * share their state's code. Scope beyond the member states is a question for the lawyer.
 */
export const EU_CONSUMER_TERRITORIES: readonly string[] = Object.freeze([
  ...EU_COUNTRIES, 'AX', 'GF', 'GP', 'MQ', 'RE', 'YT', 'MF',
])

/** The EEA members outside the EU. */
export const EEA_EXTRA: readonly string[] = Object.freeze(['IS', 'LI', 'NO'])

/** The territories whose consumers have the right of withdrawal by default: the EU's and the EEA's. */
export const CONSUMER_RIGHTS_TERRITORIES: readonly string[] = Object.freeze([
  ...EU_CONSUMER_TERRITORIES, ...EEA_EXTRA,
])

/**
 * Country → the language of its legal copy, only where that is unambiguous (Belgium, Luxembourg,
 * Switzerland, Canada … are absent and fall back to the policy's default). An application widens
 * or overrides it with `ConsumerRightsPolicy.languages`.
 */
export const COUNTRY_LANGUAGES: Readonly<Record<string, string>> = Object.freeze({
  DE: 'de', AT: 'de', LI: 'de',
  FR: 'fr', GF: 'fr', GP: 'fr', MQ: 'fr', RE: 'fr', YT: 'fr', MF: 'fr', MC: 'fr',
  PL: 'pl',
  ES: 'es',
  IE: 'en', MT: 'en', GB: 'en', US: 'en', AU: 'en', NZ: 'en',
  UA: 'uk',
  BY: 'be',
  RU: 'ru',
})
