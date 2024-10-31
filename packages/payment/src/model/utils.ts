
import type { JSONSchemaType } from 'ajv'
import type { LimitConfig, CapabilityUsage } from '../types.js'
import { PlanDurationSchema } from '../consts.js'
import { DateSchema } from '@owlmeans/auth'

export const LimitConfigSchema: JSONSchemaType<LimitConfig> = {
  type: 'object',
  properties: {
    interval: PlanDurationSchema,
    measurment: { type: 'string', nullable: true, maxLength: 16 },
    limit: { type: 'number' }
  },
  required: ['interval', 'limit'],
  additionalProperties: false,
}

export const CapabilityUsageSchema: JSONSchemaType<CapabilityUsage> = {
  type: 'object',
  properties: {
    interval: PlanDurationSchema,
    measurment: { type: 'string', nullable: true, maxLength: 16 },
    startedAt: DateSchema,
    limit: { type: 'number' },
    refreshedAt: { ...DateSchema, nullable: true },
    refreshAt: { ...DateSchema, nullable: true },
    lastConsumedAt: { ...DateSchema, nullable: true },
    consumption: { type: 'number' }
  },
  required: ['interval', 'limit', 'startedAt', 'consumption'],
  additionalProperties: false,
}
