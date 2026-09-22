import type { JSONSchemaType } from 'ajv'
import { CODE_MAX } from '@owlmeans/planning'
import { ProjectArea } from '../areas/consts.js'
import { StoryKind } from '../ba/consts.js'
import { ConnectLlm, ConnectTarget } from '../connect/consts.js'
import { ProjectOriginSchema } from '../convert/schemas.js'
import { StoryActor } from '../design/runtime.js'
import type { ViableProjectFields, ViableStoryFields } from './types.js'

/**
 * The `fields` schema of a `viable:project` card.
 *
 * A record-element schema: hand-written, cast, every optional key nullable with its type, every
 * nullable enum listing `null`. Plain strings where the vocabulary grows in a library this record
 * does not redeploy with (blueprint, case, game kind).
 */
export const ViableProjectFieldsSchema = {
  type: 'object',
  properties: {
    formerAliases: {
      type: 'array', items: { type: 'string', minLength: 1, maxLength: CODE_MAX }, nullable: true,
    },
    language: { type: 'string', minLength: 2, maxLength: 16, nullable: true },
    blueprint: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
    blueprintCase: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
    gameKind: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
    target: { type: 'string', enum: [...Object.values(ConnectTarget), null], nullable: true },
    origin: { ...ProjectOriginSchema, nullable: true },
    connectLlmMode: { type: 'string', enum: [...Object.values(ConnectLlm), null], nullable: true },
    converterLlmMode: { type: 'string', enum: [...Object.values(ConnectLlm), null], nullable: true },
    // `story: null` is a DECIDED "no gate" and must stay spellable; an absent `landing` is "never
    // decided". `at` carries no `format`: the planning registry compiles without ajv-formats.
    landing: {
      type: 'object',
      nullable: true,
      properties: {
        story: { type: 'string', minLength: 1, maxLength: CODE_MAX, nullable: true },
        at: { type: 'string', minLength: 1, maxLength: 32 },
      },
      required: ['at'],
      additionalProperties: false,
    },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ViableProjectFields>

/**
 * The `fields` schema of a `viable:user-story` card.
 *
 * `area` is required, and a create that carries none is still valid by the time it is checked:
 * validation runs after the planning middlewares, and the viable plugin's re-format hook fills the
 * area of a narrative a person wrote.
 */
export const ViableStoryFieldsSchema = {
  type: 'object',
  properties: {
    area: { type: 'string', enum: Object.values(ProjectArea) },
    primary: { type: 'boolean' },
    actor: { type: 'string', enum: [...Object.values(StoryActor), null], nullable: true },
    warning: { type: 'string', maxLength: 1024, nullable: true },
    kind: { type: 'string', enum: [...Object.values(StoryKind), null], nullable: true },
    landing: { type: 'boolean', nullable: true },
  },
  required: ['area', 'primary'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ViableStoryFields>

/** The open `fields` of a reserved card type — nothing is decided about them yet. */
export const ViableOpenFieldsSchema = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: true,
} as unknown as JSONSchemaType<Record<string, unknown>>

/** A document carries nothing under `fields`: its payload is the specification body. */
export const ViableSpecFieldsSchema = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<Record<string, never>>
