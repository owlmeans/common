import type { JSONSchemaType } from 'ajv'
import type { PortalLinkBody, PortalLinkResponse } from '../types.js'
import { ResourceValueSchema } from '@owlmeans/auth'
import { schema } from '@owlmeans/entrypoint'
import { PortalFlowSchema } from '../consts.js'

export const PortalLinkBodySchema = schema<PortalLinkBody>({
  type: 'object',
  properties: {
    flow: PortalFlowSchema,
    planSku: { ...ResourceValueSchema, nullable: true },
    returnUrl: { type: 'string', minLength: 1, maxLength: 2048, nullable: true },
  },
  required: ['flow'],
  additionalProperties: false,
} as JSONSchemaType<PortalLinkBody>)

export const PortalLinkResponseSchema = schema<PortalLinkResponse>({
  type: 'object',
  properties: {
    url: { type: 'string', minLength: 1 },
  },
  required: ['url'],
  additionalProperties: false,
} as JSONSchemaType<PortalLinkResponse>)
