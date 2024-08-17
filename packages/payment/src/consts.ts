import type { JSONSchemaType } from 'ajv'

export enum ProductType {
  Simple = 'simple',
  Service = 'service'
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
  Paid = 'paid',
  Canceled = 'canceled',
  Expired = 'expired',
  Suspended = 'suspended',
  Blocked = 'blocked',
  Ended = 'ended',
  Free = 'free',
  Active = 'active'
}

export const ProductTypeSchema: JSONSchemaType<ProductType> = {
  type: 'string',
  enum: Object.values(ProductType)
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

export const DEFAULT_ALIAS = 'payment'

