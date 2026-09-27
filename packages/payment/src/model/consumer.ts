import type { JSONSchemaType } from 'ajv'
import { IdValueSchema, ResourceValueSchema } from '@owlmeans/auth'
import { schema } from '@owlmeans/entrypoint'
import {
  CancellationKindSchema, CancellationStatusSchema, ConsumerRegion, ConsumerRegionSchema, PurchaseKindSchema,
  TaxBehaviorSchema, WithdrawalStatusSchema,
} from '../consts.js'
import { CountrySchema } from '../countries.js'
import { AmountCheckoutPolicySchema } from './pricing.js'
import type {
  AmountPolicyQuery, AmountPolicyView, BillingProfileView, CancellationBody, CancellationReceipt, CheckoutLimitView,
  ConsumerRightsLinks, ConsumerRightsMechanisms, ConsumerRightsPolicy, ConsumerRightsPublicView, DeclarationReceipt,
  PerformanceConsentBody, PerformanceConsentResponse, PerformanceConsentView, PlanPriceList, PlanPricesQuery,
  PlanPriceView, PlanWithdrawalComponent, PurchaseList, PurchaseView, SubscriptionStartBody,
  SubscriptionStartQuery, SubscriptionStartResponse, SubscriptionStartView, WithdrawalBody, WithdrawalCandidate,
  WithdrawalCandidateList, WithdrawalEstimate, WithdrawalReceipt,
} from '../types.js'

/**
 * The consumer-rights schemas describe the WIRE: a date is an ISO string, exactly as in
 * `model/view.ts` — a response serializer writes a `Date` through it as ISO. A browser revives the
 * dates with the `revive*` helpers before touching one.
 */
const IsoDateSchema = { type: 'string', format: 'date-time' } as unknown as JSONSchemaType<Date>

const MinorSchema: JSONSchemaType<number> = { type: 'number', minimum: 0, multipleOf: 1 }
const CurrencySchema: JSONSchemaType<string> = { type: 'string', minLength: 3, maxLength: 3 }
const VersionSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 64 }
const KeySchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 128 }
const UrlSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 2048 }
const LanguageSchema: JSONSchemaType<string> = {
  type: 'string', minLength: 2, maxLength: 16, pattern: '^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})?$',
}
const NameSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 200 }
const EmailSchema: JSONSchemaType<string> = {
  type: 'string', minLength: 3, maxLength: 254, pattern: '^[^\\s@]+@[^\\s@]+$',
}
const HoneypotSchema: JSONSchemaType<string> = { type: 'string', maxLength: 256 }
const AcknowledgedSchema = { type: 'boolean', const: true } as unknown as JSONSchemaType<true>
/** A region that may be `null` on the wire — an enum admits `null` only when it lists it. */
const NullableRegionSchema = {
  ...ConsumerRegionSchema, enum: [...ConsumerRegionSchema.enum, null], nullable: true,
} as unknown as JSONSchemaType<ConsumerRegion | null>

export const ConsumerRightsLinksSchema: JSONSchemaType<ConsumerRightsLinks> = {
  type: 'object',
  properties: {
    billingTerms: UrlSchema,
    withdrawalInformation: { ...UrlSchema, nullable: true },
    withdrawalForm: { ...UrlSchema, nullable: true },
    withdrawalFunction: { ...UrlSchema, nullable: true },
    cancellation: { ...UrlSchema, nullable: true },
  },
  required: ['billingTerms'],
  additionalProperties: false,
}

export const ConsumerRightsMechanismsSchema: JSONSchemaType<ConsumerRightsMechanisms> = {
  type: 'object',
  properties: {
    countryLock: { type: 'boolean' },
    checkoutTerms: { type: 'boolean' },
    performanceConsent: { type: 'boolean' },
    subscriptionStart: { type: 'boolean' },
    withdrawal: { type: 'boolean' },
    automaticRefunds: { type: 'boolean' },
    cancellation: { type: 'boolean' },
    purchaseConfirmation: { type: 'boolean' },
  },
  required: [
    'countryLock', 'checkoutTerms', 'performanceConsent', 'subscriptionStart', 'withdrawal', 'automaticRefunds',
    'cancellation', 'purchaseConfirmation',
  ],
  additionalProperties: false,
}

export const ConsumerRightsPolicySchema = schema<ConsumerRightsPolicy>({
  type: 'object',
  properties: {
    textVersion: VersionSchema,
    countries: { type: 'array', items: CountrySchema },
    unknownCountry: { type: 'string', enum: ['protect', 'ignore'] },
    withdrawalDays: { type: 'number', minimum: 14, multipleOf: 1 },
    deadline: {
      type: 'object',
      properties: {
        weekendRollover: { type: 'boolean' },
        marginDays: { type: 'number', minimum: 0, maximum: 7, multipleOf: 1 },
      },
      required: ['weekendRollover', 'marginDays'],
      additionalProperties: false,
    },
    mechanisms: ConsumerRightsMechanismsSchema,
    currencies: {
      type: 'object',
      properties: {
        eu: { ...CurrencySchema, nullable: true },
        other: { ...CurrencySchema, nullable: true },
      },
      required: [],
      additionalProperties: false,
      nullable: true,
    },
    languages: { type: 'object', required: [], additionalProperties: LanguageSchema, nullable: true },
    defaultLanguage: LanguageSchema,
    links: { type: 'object', required: [], additionalProperties: ConsumerRightsLinksSchema },
    renewalOpensWindow: { type: 'boolean', nullable: true },
    startRequestTtlSeconds: { type: 'number', minimum: 1, multipleOf: 1, nullable: true },
    exemptBusinesses: { type: 'boolean', nullable: true },
  },
  required: [
    'textVersion', 'countries', 'unknownCountry', 'withdrawalDays', 'deadline', 'mechanisms', 'defaultLanguage',
    'links',
  ],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConsumerRightsPolicy>)

export const PlanWithdrawalComponentSchema: JSONSchemaType<PlanWithdrawalComponent> = {
  type: 'object',
  properties: {
    key: KeySchema,
    basis: { type: 'string', enum: ['time', 'units'] },
    shareMinor: MinorSchema,
  },
  required: ['key', 'basis', 'shareMinor'],
  additionalProperties: false,
}

export const BillingProfileViewSchema = schema<BillingProfileView>({
  type: 'object',
  properties: {
    country: { ...CountrySchema, nullable: true },
    region: NullableRegionSchema,
    currency: { ...CurrencySchema, nullable: true },
    locked: { type: 'boolean' },
    lockedAt: { ...IsoDateSchema, nullable: true },
    language: LanguageSchema,
    inScope: { type: 'boolean' },
  },
  required: ['country', 'region', 'currency', 'locked', 'language', 'inScope'],
  additionalProperties: false,
} as unknown as JSONSchemaType<BillingProfileView>)

export const PurchaseViewSchema: JSONSchemaType<PurchaseView> = {
  type: 'object',
  properties: {
    purchaseId: IdValueSchema,
    contractRef: IdValueSchema,
    kind: PurchaseKindSchema,
    purchasedAt: IsoDateSchema,
    deadline: { ...IsoDateSchema, nullable: true },
    productSku: KeySchema,
    planSku: { ...KeySchema, nullable: true },
    amountTotalMinor: MinorSchema,
    currency: CurrencySchema,
    consentedAt: { ...IsoDateSchema, nullable: true },
    withdrawnAt: { ...IsoDateSchema, nullable: true },
    withdrawable: { type: 'boolean' },
  },
  required: [
    'purchaseId', 'contractRef', 'kind', 'purchasedAt', 'productSku', 'amountTotalMinor', 'currency', 'withdrawable',
  ],
  additionalProperties: false,
}

export const PurchaseListSchema = schema<PurchaseList>({
  type: 'object',
  properties: { purchases: { type: 'array', items: PurchaseViewSchema } },
  required: ['purchases'],
  additionalProperties: false,
})

export const PerformanceConsentViewSchema = schema<PerformanceConsentView>({
  type: 'object',
  properties: {
    required: { type: 'boolean' },
    region: NullableRegionSchema,
    country: { ...CountrySchema, nullable: true },
    language: LanguageSchema,
    trader: NameSchema,
    textVersion: VersionSchema,
    copyVersion: VersionSchema,
    links: ConsumerRightsLinksSchema,
    purchases: { type: 'array', items: PurchaseViewSchema },
    deadline: { ...IsoDateSchema, nullable: true },
    at: IsoDateSchema,
  },
  required: [
    'required', 'region', 'country', 'language', 'trader', 'textVersion', 'copyVersion', 'links', 'purchases', 'at',
  ],
  additionalProperties: false,
} as unknown as JSONSchemaType<PerformanceConsentView>)

export const PerformanceConsentBodySchema = schema<PerformanceConsentBody>({
  type: 'object',
  properties: {
    purchaseIds: { type: 'array', items: IdValueSchema, maxItems: 100, uniqueItems: true },
    textVersion: VersionSchema,
    language: LanguageSchema,
    acknowledged: AcknowledgedSchema,
    uiLanguage: { ...LanguageSchema, nullable: true },
  },
  required: ['purchaseIds', 'textVersion', 'language', 'acknowledged'],
  additionalProperties: false,
} as unknown as JSONSchemaType<PerformanceConsentBody>)

export const PerformanceConsentResponseSchema = schema<PerformanceConsentResponse>({
  type: 'object',
  properties: {
    consentId: IdValueSchema,
    consentedAt: IsoDateSchema,
    purchaseIds: { type: 'array', items: IdValueSchema },
    mailed: { type: 'boolean' },
  },
  required: ['consentId', 'consentedAt', 'purchaseIds', 'mailed'],
  additionalProperties: false,
})

export const SubscriptionStartQuerySchema = schema<SubscriptionStartQuery>({
  type: 'object',
  properties: { planSku: ResourceValueSchema },
  required: ['planSku'],
  additionalProperties: false,
})

export const SubscriptionStartViewSchema = schema<SubscriptionStartView>({
  type: 'object',
  properties: {
    required: { type: 'boolean' },
    planSku: KeySchema,
    language: LanguageSchema,
    trader: NameSchema,
    textVersion: VersionSchema,
    copyVersion: VersionSchema,
    links: ConsumerRightsLinksSchema,
    region: NullableRegionSchema,
  },
  required: ['required', 'planSku', 'language', 'trader', 'textVersion', 'copyVersion', 'links', 'region'],
  additionalProperties: false,
} as unknown as JSONSchemaType<SubscriptionStartView>)

export const SubscriptionStartBodySchema = schema<SubscriptionStartBody>({
  type: 'object',
  properties: {
    planSku: ResourceValueSchema,
    textVersion: VersionSchema,
    language: LanguageSchema,
    acknowledged: AcknowledgedSchema,
  },
  required: ['planSku', 'textVersion', 'language', 'acknowledged'],
  additionalProperties: false,
} as unknown as JSONSchemaType<SubscriptionStartBody>)

export const SubscriptionStartResponseSchema = schema<SubscriptionStartResponse>({
  type: 'object',
  properties: {
    startRequestId: IdValueSchema,
    requestedAt: IsoDateSchema,
    expiresAt: IsoDateSchema,
  },
  required: ['startRequestId', 'requestedAt', 'expiresAt'],
  additionalProperties: false,
})

export const WithdrawalEstimateSchema: JSONSchemaType<WithdrawalEstimate> = {
  type: 'object',
  properties: {
    refundMinor: MinorSchema,
    currency: CurrencySchema,
    timeDeductionMinor: MinorSchema,
    unitsDeductionMinor: MinorSchema,
    elapsedDays: { ...MinorSchema, nullable: true },
    periodDays: { ...MinorSchema, nullable: true },
    unitsUsed: { type: 'number', minimum: 0, nullable: true },
    unitsGranted: { type: 'number', minimum: 0, nullable: true },
  },
  required: ['refundMinor', 'currency', 'timeDeductionMinor', 'unitsDeductionMinor'],
  additionalProperties: false,
}

export const WithdrawalCandidateSchema: JSONSchemaType<WithdrawalCandidate> = {
  type: 'object',
  properties: {
    purchaseId: IdValueSchema,
    contractRef: IdValueSchema,
    kind: PurchaseKindSchema,
    purchasedAt: IsoDateSchema,
    deadline: IsoDateSchema,
    amountTotalMinor: MinorSchema,
    currency: CurrencySchema,
    estimate: { ...WithdrawalEstimateSchema, nullable: true },
    automatic: { type: 'boolean' },
  },
  required: [
    'purchaseId', 'contractRef', 'kind', 'purchasedAt', 'deadline', 'amountTotalMinor', 'currency', 'estimate',
    'automatic',
  ],
  additionalProperties: false,
} as unknown as JSONSchemaType<WithdrawalCandidate>

export const WithdrawalCandidateListSchema = schema<WithdrawalCandidateList>({
  type: 'object',
  properties: {
    candidates: { type: 'array', items: WithdrawalCandidateSchema },
    language: LanguageSchema,
    links: ConsumerRightsLinksSchema,
    name: { ...NameSchema, nullable: true },
    email: { ...EmailSchema, nullable: true },
  },
  required: ['candidates', 'language', 'links'],
  additionalProperties: false,
})

export const WithdrawalBodySchema = schema<WithdrawalBody>({
  type: 'object',
  properties: {
    purchaseId: { ...IdValueSchema, nullable: true },
    contractRef: { ...IdValueSchema, nullable: true },
    name: NameSchema,
    email: EmailSchema,
    language: { ...LanguageSchema, nullable: true },
    honeypot: { ...HoneypotSchema, nullable: true },
  },
  required: ['name', 'email'],
  additionalProperties: false,
})

const ReceiptContentSchema = {
  type: 'object', required: [], additionalProperties: { type: 'string', maxLength: 4096 },
} as unknown as JSONSchemaType<Record<string, string>>

const declarationReceiptProperties = {
  declarationId: IdValueSchema,
  receivedAt: IsoDateSchema,
  content: ReceiptContentSchema,
  mailed: { type: 'boolean' },
}

export const DeclarationReceiptSchema = schema<DeclarationReceipt>({
  type: 'object',
  properties: declarationReceiptProperties,
  required: ['declarationId', 'receivedAt', 'content', 'mailed'],
  additionalProperties: false,
} as unknown as JSONSchemaType<DeclarationReceipt>)

export const WithdrawalReceiptSchema = schema<WithdrawalReceipt>({
  type: 'object',
  properties: {
    ...declarationReceiptProperties,
    status: WithdrawalStatusSchema,
    refundMinor: { ...MinorSchema, nullable: true },
    currency: { ...CurrencySchema, nullable: true },
    subscriptionCanceled: { type: 'boolean', nullable: true },
  },
  required: ['declarationId', 'receivedAt', 'content', 'mailed', 'status'],
  additionalProperties: false,
} as unknown as JSONSchemaType<WithdrawalReceipt>)

export const CancellationBodySchema = schema<CancellationBody>({
  type: 'object',
  properties: {
    kind: CancellationKindSchema,
    reason: { type: 'string', maxLength: 2000, nullable: true },
    name: NameSchema,
    contractRef: { ...IdValueSchema, nullable: true },
    subscriptionId: { ...IdValueSchema, nullable: true },
    effective: { type: 'string', enum: ['earliest', 'date'] },
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', nullable: true },
    email: EmailSchema,
    language: { ...LanguageSchema, nullable: true },
    honeypot: { ...HoneypotSchema, nullable: true },
  },
  required: ['kind', 'name', 'effective', 'email'],
  additionalProperties: false,
} as unknown as JSONSchemaType<CancellationBody>)

export const CancellationReceiptSchema = schema<CancellationReceipt>({
  type: 'object',
  properties: {
    ...declarationReceiptProperties,
    status: CancellationStatusSchema,
    effectiveAt: { ...IsoDateSchema, nullable: true },
  },
  required: ['declarationId', 'receivedAt', 'content', 'mailed', 'status'],
  additionalProperties: false,
} as unknown as JSONSchemaType<CancellationReceipt>)

export const ConsumerRightsPublicViewSchema = schema<ConsumerRightsPublicView>({
  type: 'object',
  properties: {
    mechanisms: {
      type: 'object',
      properties: { withdrawal: { type: 'boolean' }, cancellation: { type: 'boolean' } },
      required: ['withdrawal', 'cancellation'],
      additionalProperties: false,
    },
    languages: { type: 'array', items: LanguageSchema },
    links: { type: 'object', required: [], additionalProperties: ConsumerRightsLinksSchema },
    textVersion: VersionSchema,
  },
  required: ['mechanisms', 'languages', 'links', 'textVersion'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConsumerRightsPublicView>)

export const CheckoutLimitViewSchema: JSONSchemaType<CheckoutLimitView> = {
  type: 'object',
  properties: {
    productSku: { type: 'string', maxLength: 128 },
    planSku: { ...KeySchema, nullable: true },
    currency: CurrencySchema,
    minimumMinor: MinorSchema,
    maximumMinor: MinorSchema,
    narrowed: { type: 'boolean' },
    blocked: { type: 'boolean' },
    reason: { ...KeySchema, nullable: true },
    resetsAt: { ...IsoDateSchema, nullable: true },
    remainingMinor: { ...MinorSchema, nullable: true },
  },
  required: ['productSku', 'currency', 'minimumMinor', 'maximumMinor', 'narrowed', 'blocked'],
  additionalProperties: false,
}

export const AmountPolicyViewSchema = schema<AmountPolicyView>({
  type: 'object',
  properties: {
    policy: AmountCheckoutPolicySchema,
    limit: { ...CheckoutLimitViewSchema, nullable: true },
  },
  required: ['policy', 'limit'],
  additionalProperties: false,
} as unknown as JSONSchemaType<AmountPolicyView>)

export const AmountPolicyQuerySchema = schema<AmountPolicyQuery>({
  type: 'object',
  properties: {
    productSku: ResourceValueSchema,
    planSku: { ...ResourceValueSchema, nullable: true },
  },
  required: ['productSku'],
  additionalProperties: false,
} as JSONSchemaType<AmountPolicyQuery>)

export const PlanPriceViewSchema: JSONSchemaType<PlanPriceView> = {
  type: 'object',
  properties: {
    planSku: KeySchema,
    currency: CurrencySchema,
    unitAmountMinor: MinorSchema,
    default: { type: 'boolean' },
    taxBehavior: { ...TaxBehaviorSchema, nullable: true },
    interval: { type: 'string', enum: ['month', 'year'], nullable: true },
  },
  required: ['planSku', 'currency', 'unitAmountMinor', 'default'],
  additionalProperties: false,
} as JSONSchemaType<PlanPriceView>

export const PlanPriceListSchema = schema<PlanPriceList>({
  type: 'object',
  properties: { prices: { type: 'array', items: PlanPriceViewSchema } },
  required: ['prices'],
  additionalProperties: false,
})

export const PlanPricesQuerySchema = schema<PlanPricesQuery>({
  type: 'object',
  properties: { productSku: ResourceValueSchema },
  required: ['productSku'],
  additionalProperties: false,
})
