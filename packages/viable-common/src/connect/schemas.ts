import type { JSONSchemaType } from 'ajv'
import { ConversionDecision, OriginKind } from '../convert/consts.js'
import {
  CONNECT_INQUIRY_MAX_TEXT, ConnectHarness, ConnectLlm, ConnectOpErrorKind, ConnectSessionStatus,
  ConnectTarget, ConnectTransport, ModelTaskResultKind, ModelTier
} from './consts.js'
import type { ConnectOpResult, InquiryAnswerPayload } from './ops.js'
import type {
  ConnectAttachBody, ConnectConfirmBody, ConnectConvertCreateBody, ConnectConvertProceedBody,
  ConnectCreateBody, ConnectJobParams, ConnectLlmBody, ConnectModifyBody, ConnectPipelineParams,
  ConnectPipelineResumeBody, ConnectProjectLlmBody, ConnectSession, ConnectSessionOpen,
  ConnectSessionParams, ConnectStoryBody, ConnectStoryQuery, ConnectWaitQuery
} from './types.js'

/**
 * A nullable ENUM carries `null` as one of its values.
 *
 * `nullable` and `enum` are separate Ajv keywords, checked independently: `nullable: true` widens
 * the TYPE check to admit `null` and the `enum` check then refuses the very same value, so the
 * field can only ever be OMITTED — never sent empty. That is not the same thing here. A connector
 * is somebody else's process putting JSON on the wire and it serialises an unset optional as
 * `null` as readily as it drops the key, and in `ConnectProjectLlmBody.llmMode` the `null` MEANS
 * something ("inherit the profile's setting") and has no other spelling. So every `enum` beside a
 * `nullable: true` is written `[...Object.values(X), null]`. `tests/convert.spec.ts` walks every
 * schema this package exports and fails on the pair written apart.
 */

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
    // Deliberately NOT `enum: Object.values(ConnectExecutor)`. The SDK and the platform ship
    // separately, so a connector built against a newer package advertises an executor kind this
    // platform has never heard of — and an enum turns that into a refused session rather than an
    // unused capability. Forward tolerance: an unknown value is simply not matched by anything.
    executors: { type: 'array', items: { type: 'string', maxLength: 32 } },
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
    transport: { type: 'string', enum: [...Object.values(ConnectTransport), null], nullable: true },
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
        kind: { type: 'string', enum: [...Object.values(ConnectOpErrorKind), null], nullable: true },
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
    target: { type: 'string', enum: [...Object.values(ConnectTarget), null], nullable: true },
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
    target: { type: 'string', enum: [...Object.values(ConnectTarget), null], nullable: true },
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
    // Keyed by inquiry id, so the key space is open by construction and cannot be enumerated.
    // The values are validated where they are read, against InquiryAnswerSchema.
    answers: { type: 'object', additionalProperties: true, required: [], nullable: true },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectPipelineResumeBody>

/**
 * One answer to one question.
 *
 * `value` is a union — one choice or several — expressed as `oneOf`, never as a `nullable` with no
 * `type`: Ajv refuses that, and this schema is compiled at route registration, so the refusal
 * takes the whole API down at boot rather than failing the one call that carried the value.
 */
export const InquiryAnswerSchema = {
  type: 'object',
  properties: {
    inquiryId: idValue,
    value: {
      oneOf: [
        { type: 'string', maxLength: CONNECT_INQUIRY_MAX_TEXT },
        {
          type: 'array',
          items: { type: 'string', maxLength: CONNECT_INQUIRY_MAX_TEXT },
          maxItems: 32,
        },
      ],
    },
    text: { type: 'string', maxLength: CONNECT_INQUIRY_MAX_TEXT, nullable: true },
    declined: { type: 'boolean', nullable: true },
  },
  required: ['inquiryId'],
  additionalProperties: false,
} as unknown as JSONSchemaType<InquiryAnswerPayload>

/** The two ids an answer is addressed by: the project it belongs to and the question it answers. */
export const ConnectInquiryParamsSchema = {
  type: 'object',
  properties: { id: idValue, inquiryId: idValue },
  required: ['id', 'inquiryId'],
  additionalProperties: false,
} as JSONSchemaType<{ id: string, inquiryId: string }>

export const ConnectConvertCreateBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 128, nullable: true },
    about: { type: 'string', maxLength: 16384, nullable: true },
    target: { type: 'string', enum: [...Object.values(ConnectTarget), null], nullable: true },
    origin: {
      type: 'object',
      nullable: true,
      properties: {
        kind: { type: 'string', enum: Object.values(OriginKind) },
        repoUrl: { type: 'string', maxLength: 2048, nullable: true },
        branch: { type: 'string', maxLength: 256, nullable: true },
      },
      required: ['kind'],
      additionalProperties: false,
    },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectConvertCreateBody>

export const ConnectConvertProceedBodySchema = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: Object.values(ConversionDecision) },
    note: { type: 'string', maxLength: 4096, nullable: true },
  },
  required: ['decision'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectConvertProceedBody>

export const ConnectLlmBodySchema = {
  type: 'object',
  properties: { llmMode: { type: 'string', enum: Object.values(ConnectLlm) } },
  required: ['llmMode'],
  additionalProperties: false,
} as JSONSchemaType<ConnectLlmBody>

export const ConnectProjectLlmBodySchema = {
  type: 'object',
  properties: { llmMode: { type: 'string', enum: [...Object.values(ConnectLlm), null], nullable: true } },
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
