import type { JSONSchemaType } from 'ajv'
import { DateSchema, IdValueSchema } from '@owlmeans/auth'
import {
  MATERIAL_DESCRIPTION_MAX, MATERIAL_NAME_MAX, MATERIAL_NOTE_MAX, MATERIAL_PATH_MAX, MATERIAL_USES_MAX,
  MaterialPurpose, MaterialRemoval, MaterialStatus, MaterialUseBy,
} from './consts.js'
import type { MaterialIndexEntry, MaterialUse, ProjectMaterialRecord } from './types.js'

const pathValue = { type: 'string', minLength: 1, maxLength: MATERIAL_PATH_MAX } as const

/**
 * Record-element schemas: hand-written and cast, because the platform re-applies them as a Mongo
 * `$jsonSchema` — no `integer` (a stored number is a double), no typed `Record<>` maps, every
 * nullable carrying its type and every nullable enum listing `null`.
 *
 * `target` carries no enum: a newer agent may name a use an older platform does not know.
 */
export const MaterialUseSchema = {
  type: 'object',
  properties: {
    target: { type: 'string', minLength: 1, maxLength: 64 },
    by: { type: 'string', enum: Object.values(MaterialUseBy) },
    source: { ...pathValue, nullable: true },
    note: { type: 'string', maxLength: MATERIAL_NOTE_MAX, nullable: true },
  },
  required: ['target', 'by'],
  additionalProperties: false,
} as unknown as JSONSchemaType<MaterialUse>

/** What a catalogue entry carries — shared by the stored record and the target's index entry. */
const entryProperties = {
  path: pathValue,
  name: { type: 'string', minLength: 1, maxLength: MATERIAL_NAME_MAX },
  size: { type: 'number', minimum: 0 },
  mime: { type: 'string', maxLength: 255, nullable: true },
  // A string, not an enum: the file inspector's kinds grow, and a row the platform cannot store is
  // a file the person loses.
  kind: { type: 'string', maxLength: 64, nullable: true },
  digest: { type: 'string', maxLength: 128, nullable: true },
  from: { ...pathValue, nullable: true },
  status: { type: 'string', enum: Object.values(MaterialStatus) },
  reason: { type: 'string', enum: [...Object.values(MaterialRemoval), null], nullable: true },
  purpose: { type: 'string', enum: [...Object.values(MaterialPurpose), null], nullable: true },
  description: { type: 'string', maxLength: MATERIAL_DESCRIPTION_MAX, nullable: true },
  // Open on purpose — dimensions, pages, language, duration, palette and whatever a newer analysis
  // adds. No typed map: an `additionalProperties` schema is what a collection validator refuses.
  details: { type: 'object', nullable: true, required: [], additionalProperties: true },
  uses: { type: 'array', items: MaterialUseSchema, maxItems: MATERIAL_USES_MAX, nullable: true },
  transcript: { ...pathValue, nullable: true },
  placedAt: { ...pathValue, nullable: true },
} as const

/** The `project-material` row as the platform's collection validates it. */
export const ProjectMaterialRecordSchema = {
  type: 'object',
  properties: {
    id: { ...IdValueSchema, nullable: true },
    projectId: IdValueSchema,
    entityId: IdValueSchema,
    slotId: IdValueSchema,
    scope: pathValue,
    ...entryProperties,
    createdAt: { ...DateSchema },
    updatedAt: { ...DateSchema, nullable: true },
  },
  required: ['projectId', 'entityId', 'slotId', 'scope', 'path', 'name', 'size', 'status', 'createdAt'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ProjectMaterialRecord>

/** One entry of the target's `docs/materials/index.md` frontmatter. */
export const MaterialIndexEntrySchema = {
  type: 'object',
  properties: entryProperties,
  required: ['path', 'name', 'size', 'status'],
  additionalProperties: false,
} as unknown as JSONSchemaType<MaterialIndexEntry>
