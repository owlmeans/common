import type { JSONSchemaType } from 'ajv'
import { SubProject } from '../slot/consts.js'
import { RequirementKind, RequirementSource } from './consts.js'
import type { RequirementsDocument, StatedRequirement } from './types.js'

/**
 * One stated requirement, as it is STORED — in the `requirements` document of a project or a story
 * card, and in a story design.
 *
 * A record-element schema: hand-written and cast, every optional key nullable with its type. The
 * parts are an object of four optional strings rather than a map, so a part the vocabulary does
 * not know is refused instead of carried.
 */
export const StatedRequirementSchema = {
  type: 'object',
  title: 'StatedRequirement',
  properties: {
    id: { type: 'string', pattern: '^[RS][0-9]+$' },
    quote: { type: 'string' },
    statement: { type: 'string' },
    kind: { type: 'string', enum: Object.values(RequirementKind) },
    parts: {
      type: 'object',
      properties: {
        tech: { type: 'string', nullable: true },
        ba: { type: 'string', nullable: true },
        ux: { type: 'string', nullable: true },
        ui: { type: 'string', nullable: true },
      },
      required: [],
      additionalProperties: false,
    },
    packages: {
      type: 'array',
      nullable: true,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          side: { type: 'string', enum: Object.values(SubProject) },
        },
        required: ['name', 'side'],
        additionalProperties: false,
      },
    },
    note: { type: 'string', nullable: true },
    stories: { type: 'array', items: { type: 'string' }, nullable: true },
    source: { type: 'string', enum: Object.values(RequirementSource) },
  },
  required: ['id', 'quote', 'statement', 'kind', 'parts', 'source'],
  additionalProperties: false,
} as unknown as JSONSchemaType<StatedRequirement>

/**
 * The `requirements` specification slot's body — on a project card (every requirement and the
 * story codes it applies to) and on a story card (its slice).
 *
 * Validated by the planning store before the write, like the design and the scaffold plan. A
 * stored document only grows optional: a field added later is optional and nullable here.
 */
export const RequirementsDocumentSchema = {
  type: 'object',
  title: 'RequirementsDocument',
  description: 'The requirements a requester stated, quoted in their own words',
  properties: {
    version: { type: 'integer', minimum: 1 },
    items: { type: 'array', items: StatedRequirementSchema },
    assignedAt: { type: 'string', nullable: true },
    uncovered: { type: 'array', items: { type: 'string' }, nullable: true },
  },
  required: ['version', 'items'],
  additionalProperties: false,
} as unknown as JSONSchemaType<RequirementsDocument>
