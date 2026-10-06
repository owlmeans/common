import type { JSONSchemaType } from 'ajv'
import { IdValueSchema, ResourceValueSchema } from '@owlmeans/auth'
import { schema } from '@owlmeans/entrypoint'
import { CancellationKindSchema, CancellationStatusSchema, WithdrawalStatusSchema, CountrySchema } from '../consts.js'
import { AmountCheckoutPolicySchema } from './pricing.js'
import type { AmountPolicyQuery, AmountPolicyView, BillingProfileView, CancellationBody, CancellationReceipt, ConsumerRightsPolicy, ConsumerRightsPublicView, DeclarationReceipt, PerformanceConsentBody, PerformanceConsentResponse, PerformanceConsentView, PlanPriceList, PlanPricesQuery, PurchaseList, SubscriptionStartBody, SubscriptionStartQuery, SubscriptionStartResponse, SubscriptionStartView, WithdrawalBody, WithdrawalCandidateList, WithdrawalReceipt } from '../types.js'
import { AcknowledgedSchema, ConsentContextSchema, CurrencySchema, declarationReceiptProperties, EmailSchema, HoneypotSchema, IsoDateSchema, KeySchema, LanguageSchema, MinorSchema, NameSchema, VersionSchema } from './consts.local.js'
import { CheckoutLimitViewSchema, ConsumerRightsLinksSchema, ConsumerRightsMechanismsSchema, PlanPriceViewSchema, PurchaseViewSchema, WithdrawalCandidateSchema } from './consts.js'
import { NullableRegionSchema } from './consts.local.js'

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
    consentContext: { ...ConsentContextSchema, nullable: true },
  },
  required: [
    'textVersion', 'countries', 'unknownCountry', 'withdrawalDays', 'deadline', 'mechanisms', 'defaultLanguage',
    'links',
  ],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConsumerRightsPolicy>)

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
    context: { ...ConsentContextSchema, nullable: true },
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
    context: { ...ConsentContextSchema, nullable: true },
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
