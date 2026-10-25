import type { JSONSchemaType } from 'ajv'
import {
  AGENT_STEER_PROMPT_MAX, AgentStopScope, STORY_BATCH_MAX, STORY_BATCH_REASON_MAX, StoryBatchKind,
  StoryBatchOrderSource, StoryBatchOutcome, StoryBatchStatus,
} from './consts.js'
import type { AgentSteerArgs, AgentStopArgs, StoryBatchStartArgs, StoryBatchView } from './types.js'

const idValue = { type: 'string', minLength: 1, maxLength: 128 } as const
const isoDate = { type: 'string', minLength: 1, maxLength: 64 } as const

/**
 * A batch start. An EMPTY list is not refused here: it reaches the platform, which answers it as the
 * phrased `StoryBatchEmpty` — the same refusal a selection with no planned story in it gets.
 */
export const StoryBatchStartArgsSchema = {
  type: 'object',
  properties: {
    stories: { type: 'array', items: idValue, maxItems: STORY_BATCH_MAX, uniqueItems: true, nullable: true },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<StoryBatchStartArgs>

/** A stop. Every field may be omitted or `null`; the scope is a nullable enum carrying `null`. */
export const AgentStopArgsSchema = {
  type: 'object',
  properties: {
    scope: { type: 'string', enum: [...Object.values(AgentStopScope), null], nullable: true },
    storyId: { ...idValue, nullable: true },
    confirm: { type: 'boolean', nullable: true },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<AgentStopArgs>

export const AgentSteerArgsSchema = {
  type: 'object',
  properties: { prompt: { type: 'string', minLength: 1, maxLength: AGENT_STEER_PROMPT_MAX } },
  required: ['prompt'],
  additionalProperties: false,
} as JSONSchemaType<AgentSteerArgs>

/** A batch as the platform answers it. Closed, like every view this package pins. */
export const StoryBatchViewSchema = {
  type: 'object',
  properties: {
    id: idValue,
    projectId: idValue,
    kind: { type: 'string', enum: Object.values(StoryBatchKind) },
    status: { type: 'string', enum: Object.values(StoryBatchStatus) },
    stories: { type: 'array', items: idValue, maxItems: STORY_BATCH_MAX },
    codes: { type: 'object', additionalProperties: { type: 'string', maxLength: 64 }, required: [] },
    ordering: {
      type: 'object',
      nullable: true,
      properties: {
        source: { type: 'string', enum: Object.values(StoryBatchOrderSource) },
        reasons: {
          type: 'object', additionalProperties: { type: 'string', maxLength: STORY_BATCH_REASON_MAX }, required: [],
        },
      },
      required: ['source', 'reasons'],
      additionalProperties: false,
    },
    current: { ...idValue, nullable: true },
    outcomes: {
      type: 'object', additionalProperties: { type: 'string', enum: Object.values(StoryBatchOutcome) }, required: [],
    },
    reason: { type: 'string', maxLength: 4096, nullable: true },
    createdAt: isoDate,
    updatedAt: isoDate,
    finishedAt: { ...isoDate, nullable: true },
  },
  required: ['id', 'projectId', 'kind', 'status', 'stories', 'codes', 'outcomes', 'createdAt', 'updatedAt'],
  additionalProperties: false,
} as unknown as JSONSchemaType<StoryBatchView>
