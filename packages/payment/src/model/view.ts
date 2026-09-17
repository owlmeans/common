import type { JSONSchemaType } from 'ajv'
import type {
  CapabilityView, EntitlementPlanView, EntitlementView, LimitView, PromoView,
} from '../types.js'
import { schema } from '@owlmeans/entrypoint'
import { LimitKindSchema, LimitWindowSchema, SubscriptionStatusSchema } from '../consts.js'

/**
 * The view schemas describe the WIRE: a date is an ISO string. A server response serializer
 * writes a `Date` instance through it as ISO; the record convention (`DateSchema`, an object)
 * would serialize it as `{}`. A browser reads strings back — `reviveEntitlementView` restores
 * the dates.
 */
const IsoDateSchema = { type: 'string', format: 'date-time' } as unknown as JSONSchemaType<Date>

const KeySchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 128 }

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

export const EntitlementViewSchema = schema<EntitlementView>({
  type: 'object',
  properties: {
    plan: EntitlementPlanViewSchema,
    capabilities: { type: 'array', items: CapabilityViewSchema },
    limits: { type: 'array', items: LimitViewSchema },
    at: IsoDateSchema,
  },
  required: ['plan', 'capabilities', 'limits', 'at'],
  additionalProperties: false,
} as JSONSchemaType<EntitlementView>)
