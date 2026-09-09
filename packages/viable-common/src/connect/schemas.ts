import type { JSONSchemaType } from 'ajv'
import {
  ConnectExecutor, ConnectHarness, ConnectLlm, ConnectOpErrorKind, ConnectSessionStatus,
  ConnectTarget, ConnectTransport, ModelTaskResultKind, ModelTier
} from './consts.js'
import type { ConnectOpResult } from './ops.js'
import type {
  ConnectAttachBody, ConnectConfirmBody, ConnectCreateBody, ConnectJobParams, ConnectLlmBody,
  ConnectModifyBody, ConnectPipelineParams, ConnectPipelineResumeBody, ConnectProjectLlmBody,
  ConnectSession, ConnectSessionOpen, ConnectSessionParams, ConnectStoryBody, ConnectStoryQuery,
  ConnectWaitQuery
} from './types.js'

const idValue = { type: 'string', minLength: 1, maxLength: 128 } as const
const textValue = { type: 'string', minLength: 1, maxLength: 65536 } as const

export const ConnectCapabilitiesSchema = {
  type: 'object',
  properties: {
    harness: { type: 'string', enum: Object.values(ConnectHarness) },
    tiers: {
      type: 'object',
      nullable: false,
      additionalProperties: { type: 'string', maxLength: 128 },
      required: [],
    },
    subagents: { type: 'boolean' },
    effortControl: { type: 'boolean' },
    executors: { type: 'array', items: { type: 'string', enum: Object.values(ConnectExecutor) } },
    services: {
      type: 'object',
      nullable: true,
      properties: { db: { type: 'boolean' }, valkey: { type: 'boolean' } },
      required: ['db', 'valkey'],
      additionalProperties: false,
    },
  },
  required: ['harness', 'tiers', 'subagents', 'effortControl', 'executors'],
  additionalProperties: false,
} as any

export const ConnectSessionOpenSchema = {
  type: 'object',
  properties: {
    projectId: { ...idValue, nullable: true },
    projectDir: { type: 'string', maxLength: 4096, nullable: true },
    target: { type: 'string', enum: Object.values(ConnectTarget) },
    harness: { type: 'string', enum: Object.values(ConnectHarness) },
    clientVersion: { type: 'string', minLength: 1, maxLength: 64 },
    capabilities: ConnectCapabilitiesSchema,
  },
  required: ['target', 'harness', 'clientVersion', 'capabilities'],
  additionalProperties: false,
} as JSONSchemaType<ConnectSessionOpen>

export const ConnectSessionParamsSchema = {
  type: 'object',
  properties: { sessionId: idValue },
  required: ['sessionId'],
  additionalProperties: false,
} as JSONSchemaType<ConnectSessionParams>

/**
 * The session record's own shape.
 *
 * Applied as the collection's `$jsonSchema`, so every field the platform ever writes must be
 * declared here — a field added to the type and forgotten here fails every create with a
 * validation error that names the document rather than the field.
 */
export const ConnectSessionSchema = {
  type: 'object',
  properties: {
    id: { ...idValue, nullable: true },
    profileId: idValue,
    entityId: idValue,
    projectId: { ...idValue, nullable: true },
    projectDir: { type: 'string', maxLength: 4096, nullable: true },
    target: { type: 'string', enum: Object.values(ConnectTarget) },
    llm: { type: 'string', enum: Object.values(ConnectLlm) },
    harness: { type: 'string', enum: Object.values(ConnectHarness) },
    clientVersion: { type: 'string', maxLength: 64 },
    capabilities: ConnectCapabilitiesSchema,
    status: { type: 'string', enum: Object.values(ConnectSessionStatus) },
    transport: { type: 'string', enum: Object.values(ConnectTransport), nullable: true },
    openedAt: { type: 'object', format: 'date-time', required: [] },
    lastSeenAt: { type: 'object', format: 'date-time', required: [] },
    closedAt: { type: 'object', format: 'date-time', required: [], nullable: true },
    createdAt: { type: 'object', format: 'date-time', required: [] },
    updatedAt: { type: 'object', format: 'date-time', required: [], nullable: true },
  },
  required: [
    'profileId', 'entityId', 'target', 'llm', 'harness', 'clientVersion', 'capabilities',
    'status', 'openedAt', 'lastSeenAt', 'createdAt'
  ],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectSession>

export const ConnectOpResultSchema = {
  type: 'object',
  properties: {
    opId: idValue,
    sessionId: idValue,
    ok: { type: 'boolean' },
    // Any JSON, and it may be absent — a shell result is an object, a file read a string, a
    // listing an array. Declared as the empty schema rather than as `nullable`, because Ajv
    // refuses `nullable` without a `type` and Fastify compiles this schema at route
    // registration: the refusal takes the whole API down at boot, not the one call that would
    // have carried the value.
    value: {},
    error: {
      type: 'object',
      nullable: true,
      properties: {
        type: { type: 'string', maxLength: 256 },
        message: { type: 'string', maxLength: 8192 },
        kind: { type: 'string', enum: Object.values(ConnectOpErrorKind), nullable: true },
      },
      required: ['type', 'message'],
      additionalProperties: false,
    },
  },
  required: ['opId', 'sessionId', 'ok'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectOpResult>

export const ConnectWaitQuerySchema = {
  type: 'object',
  properties: { wait: { type: 'integer', minimum: 0, maximum: 45, nullable: true } },
  required: [],
  additionalProperties: false,
} as JSONSchemaType<ConnectWaitQuery>

/** Every project-scoped connector route addresses the project by `:id`. */
export const ConnectProjectIdSchema = {
  type: 'object',
  properties: { id: idValue },
  required: ['id'],
  additionalProperties: false,
} as JSONSchemaType<{ id: string }>

export const ConnectStoryParamsSchema = {
  type: 'object',
  properties: { id: idValue, storyId: idValue },
  required: ['id', 'storyId'],
  additionalProperties: false,
} as JSONSchemaType<{ id: string, storyId: string }>

export const ConnectOpParamsSchema = {
  type: 'object',
  properties: { sessionId: idValue, opId: idValue },
  required: ['sessionId', 'opId'],
  additionalProperties: false,
} as JSONSchemaType<{ sessionId: string, opId: string }>

export const ConnectJobParamsSchema = {
  type: 'object',
  properties: { id: idValue, jobId: { type: 'string', minLength: 1, maxLength: 256 } },
  required: ['id', 'jobId'],
  additionalProperties: false,
} as JSONSchemaType<ConnectJobParams>

export const ConnectStoryQuerySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 0, nullable: true },
    size: { type: 'integer', minimum: 1, maximum: 100, nullable: true },
    status: { type: 'string', maxLength: 32, nullable: true },
    area: { type: 'string', maxLength: 32, nullable: true },
    q: { type: 'string', maxLength: 256, nullable: true },
  },
  required: [],
  additionalProperties: false,
} as JSONSchemaType<ConnectStoryQuery>

export const ConnectCreateBodySchema = {
  type: 'object',
  properties: {
    prompt: { type: 'string', minLength: 1, maxLength: 16384 },
    target: { type: 'string', enum: Object.values(ConnectTarget), nullable: true },
  },
  required: ['prompt'],
  additionalProperties: false,
} as JSONSchemaType<ConnectCreateBody>

export const ConnectConfirmBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 128, nullable: true },
    description: { type: 'string', maxLength: 16384, nullable: true },
    specification: { type: 'string', maxLength: 262144, nullable: true },
    vision: { type: 'string', maxLength: 16384, nullable: true },
    target: { type: 'string', enum: Object.values(ConnectTarget), nullable: true },
  },
  required: [],
  additionalProperties: false,
} as JSONSchemaType<ConnectConfirmBody>

export const ConnectModifyBodySchema = {
  type: 'object',
  properties: { prompt: { type: 'string', minLength: 1, maxLength: 16384 } },
  required: ['prompt'],
  additionalProperties: false,
} as JSONSchemaType<ConnectModifyBody>

export const ConnectStoryBodySchema = {
  type: 'object',
  properties: { story: textValue },
  required: ['story'],
  additionalProperties: false,
} as JSONSchemaType<ConnectStoryBody>

export const ConnectAttachBodySchema = {
  type: 'object',
  properties: {
    projectId: { ...idValue, nullable: true },
    slug: { type: 'string', maxLength: 64, nullable: true },
    projectDir: { type: 'string', maxLength: 4096, nullable: true },
  },
  required: [],
  additionalProperties: false,
} as JSONSchemaType<ConnectAttachBody>

export const ConnectPipelineParamsSchema = {
  type: 'object',
  properties: { id: idValue, runId: { type: 'string', minLength: 1, maxLength: 256 } },
  required: ['id', 'runId'],
  additionalProperties: false,
} as JSONSchemaType<ConnectPipelineParams>

export const ConnectPipelineResumeBodySchema = {
  type: 'object',
  properties: {
    from: { type: 'string', maxLength: 128, nullable: true },
    force: { type: 'boolean', nullable: true },
  },
  required: [],
  additionalProperties: false,
} as JSONSchemaType<ConnectPipelineResumeBody>

export const ConnectLlmBodySchema = {
  type: 'object',
  properties: { llmMode: { type: 'string', enum: Object.values(ConnectLlm) } },
  required: ['llmMode'],
  additionalProperties: false,
} as JSONSchemaType<ConnectLlmBody>

export const ConnectProjectLlmBodySchema = {
  type: 'object',
  properties: { llmMode: { type: 'string', enum: Object.values(ConnectLlm), nullable: true } },
  required: ['llmMode'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectProjectLlmBody>

export const ModelTaskResultSchema = {
  type: 'object',
  properties: {
    taskId: idValue,
    kind: { type: 'string', enum: Object.values(ModelTaskResultKind) },
    text: { type: 'string', maxLength: 1_048_576, nullable: true },
    // The parent agent's answer in `json` mode: any JSON the task's own output schema described.
    // The empty schema, never `nullable` — see ConnectOpResultSchema.value.
    json: {},
    toolCalls: {
      type: 'array',
      nullable: true,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', maxLength: 128, nullable: true },
          name: { type: 'string', minLength: 1, maxLength: 128 },
          args: { type: 'object', additionalProperties: true, required: [] },
        },
        required: ['name', 'args'],
        additionalProperties: false,
      },
    },
    error: { type: 'string', maxLength: 8192, nullable: true },
    usage: {
      type: 'object',
      nullable: true,
      properties: {
        inputTokens: { type: 'integer', minimum: 0, nullable: true },
        outputTokens: { type: 'integer', minimum: 0, nullable: true },
      },
      required: [],
      additionalProperties: false,
    },
    model: { type: 'string', maxLength: 128, nullable: true },
  },
  required: ['taskId', 'kind'],
  additionalProperties: false,
} as any

/** Tier → the model the parent will run it on. Free-form; display only. */
export const ModelTierValues = Object.values(ModelTier)
