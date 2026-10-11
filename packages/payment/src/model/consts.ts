import type { JSONSchemaType } from 'ajv'
import type { CheckoutLimitView, ConsumerRightsLinks, ConsumerRightsMechanisms, PlanPriceView, PlanWithdrawalComponent, PurchaseView, WithdrawalCandidate, WithdrawalEstimate, CapabilityView, EntitlementPlanView, LimitView, PromoView } from '../types.js'
import { IdValueSchema } from '@owlmeans/auth'
import { PurchaseKindSchema, TaxBehaviorSchema, LimitKindSchema, LimitWindowSchema, SubscriptionStatusSchema } from '../consts.js'
import { CurrencySchema, IsoDateSchema, KeySchema, MinorSchema, UrlSchema } from './consts.local.js'

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

export const PromoViewSchema: JSONSchemaType<PromoView> = {
  type: 'object',
  properties: {
    until: IsoDateSchema,
    grandfathered: { type: 'boolean' },
    active: { type: 'boolean' },
  },
  required: ['until', 'grandfathered', 'active'],
  additionalProperties: false,
}

export const CapabilityViewSchema: JSONSchemaType<CapabilityView> = {
  type: 'object',
  properties: {
    param: KeySchema,
    scope: KeySchema,
    permission: KeySchema,
    value: { type: ['boolean', 'number'] },
    granted: { type: 'boolean' },
    promo: { ...PromoViewSchema, nullable: true },
  },
  required: ['param', 'scope', 'permission', 'value', 'granted'],
  additionalProperties: false,
} as unknown as JSONSchemaType<CapabilityView>

export const LimitViewSchema: JSONSchemaType<LimitView> = {
  type: 'object',
  properties: {
    key: KeySchema,
    param: KeySchema,
    kind: LimitKindSchema,
    window: { ...LimitWindowSchema, nullable: true },
    limit: { type: 'number' },
    used: { type: 'number' },
    remaining: { type: 'number' },
    windowStart: { ...IsoDateSchema, nullable: true },
    resetsAt: { ...IsoDateSchema, nullable: true },
    unit: { type: 'string', nullable: true },
    promo: { ...PromoViewSchema, nullable: true },
  },
  required: ['key', 'param', 'kind', 'limit', 'used', 'remaining'],
  additionalProperties: false,
} as JSONSchemaType<LimitView>

export const EntitlementPlanViewSchema: JSONSchemaType<EntitlementPlanView> = {
  type: 'object',
  properties: {
    sku: KeySchema,
    productSku: KeySchema,
    title: { type: 'string' },
    rank: { type: 'number' },
    free: { type: 'boolean' },
    status: SubscriptionStatusSchema,
    paygate: KeySchema,
    subscriptionId: { type: 'string', nullable: true },
    subscribedAt: { ...IsoDateSchema, nullable: true },
    periodStart: { ...IsoDateSchema, nullable: true },
    periodEnd: { ...IsoDateSchema, nullable: true },
    cancelAtPeriodEnd: { type: 'boolean', nullable: true },
    trialEnd: { ...IsoDateSchema, nullable: true },
    pausedAt: { ...IsoDateSchema, nullable: true },
    pastDue: { type: 'boolean', nullable: true },
    fallbackSku: { type: 'string', nullable: true },
  },
  required: ['sku', 'productSku', 'title', 'rank', 'free', 'status', 'paygate'],
  additionalProperties: false,
} as JSONSchemaType<EntitlementPlanView>
