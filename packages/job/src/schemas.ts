import type { JSONSchemaType } from 'ajv'
import { createListSchema } from '@owlmeans/resource'
import { JobViewStatus } from './consts.js'
import type { JobListQuery, JobView } from './types.js'

const optionalNumber = { type: 'number', nullable: true } as const
const optionalString = { type: 'string', nullable: true } as const

/** Closed public shape: broker payloads, stack traces and ownership fields have nowhere to land. */
export const JobViewSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    kind: { type: 'string', maxLength: 128 },
    status: { type: 'string', enum: Object.values(JobViewStatus) },
    progress: {
      type: 'object',
      nullable: true,
      properties: {
        percent: optionalNumber,
        done: optionalNumber,
        total: optionalNumber,
        message: { type: 'string', maxLength: 512, nullable: true },
      },
      required: [],
      additionalProperties: false,
    },
    summary: { type: 'string', maxLength: 2048, nullable: true },
    metadata: { type: 'object', required: [], additionalProperties: true, nullable: true },
    result: {},
    error: {
      type: 'object',
      nullable: true,
      properties: {
        type: { type: 'string', maxLength: 128 },
        message: { type: 'string', maxLength: 2048 },
      },
      required: ['type', 'message'],
      additionalProperties: false,
    },
    cancellable: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    startedAt: optionalString,
    finishedAt: optionalString,
  },
  required: ['id', 'kind', 'status', 'cancellable', 'createdAt', 'updatedAt'],
  additionalProperties: false,
} as unknown as JSONSchemaType<JobView>

export const JobViewListSchema = createListSchema(JobViewSchema)

export const JobListQuerySchema: JSONSchemaType<JobListQuery> = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: Object.values(JobViewStatus), nullable: true },
    kind: { type: 'string', maxLength: 128, nullable: true },
    page: { type: 'number', minimum: 0, nullable: true },
    size: { type: 'number', minimum: 1, maximum: 100, nullable: true },
  },
  additionalProperties: false,
}
