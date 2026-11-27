import type { JSONSchemaType } from 'ajv'
import { AREA_KEY_MAX, AREA_KEY_PATTERN } from '../../areas/consts.js'
import { APP_NAME_PATTERN, TARGET_APP_MOUNT_OR_ROOT_PATTERN } from '../apps/consts.js'
import { AreaDescriptorSchema } from '../schemas.js'
import {
  STRUCTURE_AREAS_MAX, STRUCTURE_DECISION_SOURCES, STRUCTURE_INDEX_MAX, STRUCTURE_ISSUE_PARAMS, STRUCTURE_PARTS_MAX,
  STRUCTURE_PURPOSE_MAX, STRUCTURE_PURPOSE_PATTERN, STRUCTURE_QUEUE_MAX, STRUCTURE_QUEUE_PATTERN, STRUCTURE_QUEUES_MAX,
  STRUCTURE_QUOTE_MAX, StructureIssueCode, StructurePartKind,
} from './consts.js'
import type { ProjectStructure, StructureIssue, StructurePart, StructurePartKeys, StructureRef, ViableStructureDecision } from './types.js'

/**
 * The structure records, as the project card, a preliminary record and the wire carry them.
 *
 * Record-element schemas: hand-written and cast, every optional key nullable with its type. No
 * `integer`, no `multipleOf` and no `format` — the card's fields are also checked by the browser's
 * planning validator, which refuses both keywords, and the planning registry compiles without
 * ajv-formats; an index is a plain `number` here and a whole number by `projectStructureHelper.validate`.
 * The SHAPE is checked here; every rule between parts is the helper's.
 */

const partName = () => ({ type: 'string', minLength: 2, maxLength: 16, pattern: APP_NAME_PATTERN.source })

const partKeyProperties = () => ({
  name: partName(),
  kind: { type: 'string', enum: Object.values(StructurePartKind) },
  dependsOn: { type: 'array', items: partName(), maxItems: STRUCTURE_PARTS_MAX, uniqueItems: true },
  mount: { type: 'string', maxLength: 31, pattern: TARGET_APP_MOUNT_OR_ROOT_PATTERN.source, nullable: true },
  index: { type: 'number', minimum: 0, maximum: STRUCTURE_INDEX_MAX, nullable: true },
  areas: {
    type: 'array',
    items: { type: 'string', minLength: 1, maxLength: AREA_KEY_MAX, pattern: AREA_KEY_PATTERN.source },
    maxItems: STRUCTURE_AREAS_MAX,
    uniqueItems: true,
    nullable: true,
  },
  queues: {
    type: 'array',
    items: { type: 'string', minLength: 1, maxLength: STRUCTURE_QUEUE_MAX, pattern: STRUCTURE_QUEUE_PATTERN.source },
    maxItems: STRUCTURE_QUEUES_MAX,
    uniqueItems: true,
    nullable: true,
  },
})

/** One part's keys — what a run row and a topology record hold. */
export const StructurePartKeysSchema = {
  type: 'object',
  properties: partKeyProperties(),
  required: ['name', 'kind', 'dependsOn'],
  additionalProperties: false,
} as unknown as JSONSchemaType<StructurePartKeys>

/** One part with its purpose (trimmed, 1..`STRUCTURE_PURPOSE_MAX`). */
export const StructurePartSchema = {
  type: 'object',
  properties: {
    ...partKeyProperties(),
    purpose: { type: 'string', minLength: 1, maxLength: STRUCTURE_PURPOSE_MAX, pattern: STRUCTURE_PURPOSE_PATTERN.source },
  },
  required: ['name', 'kind', 'dependsOn', 'purpose'],
  additionalProperties: false,
} as unknown as JSONSchemaType<StructurePart>

const areasProperty = () => ({ type: 'array', items: AreaDescriptorSchema, minItems: 1, maxItems: STRUCTURE_AREAS_MAX })

/** A structure's keys. */
export const StructureRefSchema = {
  type: 'object',
  properties: {
    areas: areasProperty(),
    parts: { type: 'array', items: StructurePartKeysSchema, minItems: 1, maxItems: STRUCTURE_PARTS_MAX },
  },
  required: ['areas', 'parts'],
  additionalProperties: false,
} as unknown as JSONSchemaType<StructureRef>

/** A project's structure — an editor's payload, a proposal, a preliminary record's. */
export const ProjectStructureSchema = {
  type: 'object',
  properties: {
    areas: areasProperty(),
    parts: { type: 'array', items: StructurePartSchema, minItems: 1, maxItems: STRUCTURE_PARTS_MAX },
  },
  required: ['areas', 'parts'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ProjectStructure>

/** The project card's `fields.structure`: the structure, who decided it, the quoted request and when. */
export const ViableStructureDecisionSchema = {
  type: 'object',
  properties: {
    areas: areasProperty(),
    parts: { type: 'array', items: StructurePartSchema, minItems: 1, maxItems: STRUCTURE_PARTS_MAX },
    by: { type: 'string', enum: [...STRUCTURE_DECISION_SOURCES] },
    quote: { type: 'string', minLength: 1, maxLength: STRUCTURE_QUOTE_MAX, nullable: true },
    // No `format`: the planning registry compiles without ajv-formats.
    at: { type: 'string', minLength: 1, maxLength: 32 },
  },
  required: ['areas', 'parts', 'by', 'at'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ViableStructureDecision>

/** One rule a structure breaks — the code, the part, the translation's parameters, the English sentence. */
export const StructureIssueSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', enum: Object.values(StructureIssueCode) },
    part: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
    params: {
      type: 'object',
      nullable: true,
      properties: Object.fromEntries(STRUCTURE_ISSUE_PARAMS.map(name => [name, {
        anyOf: [{ type: 'string', maxLength: 512 }, { type: 'number' }],
      }])),
      required: [],
      additionalProperties: false,
    },
    message: { type: 'string', minLength: 1, maxLength: 1024 },
  },
  required: ['code', 'message'],
  additionalProperties: false,
} as unknown as JSONSchemaType<StructureIssue>
