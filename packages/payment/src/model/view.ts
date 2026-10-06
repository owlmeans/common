import type { JSONSchemaType } from 'ajv'
import type { EntitlementView } from '../types.js'
import { schema } from '@owlmeans/entrypoint'
import { IsoDateSchema } from './consts.local.js'
import { CapabilityViewSchema, EntitlementPlanViewSchema, LimitViewSchema } from './consts.js'

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
