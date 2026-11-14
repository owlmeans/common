import type { JSONSchemaType } from 'ajv'
import { DateSchema, IdValueSchema } from '@owlmeans/auth'
import {
  MATERIAL_DESCRIPTION_MAX, MATERIAL_LINK_URL_MAX, MATERIAL_NAME_MAX, MATERIAL_NOTE_MAX, MATERIAL_PATH_MAX,
  MATERIAL_SKILL_NAME_MAX, MATERIAL_USES_MAX, MaterialGeneratedKind, MaterialLinkIntent, MaterialPurpose, MaterialRemoval,
  MaterialStatus, MaterialUseBy, REFERENCE_ASKED_ORIGINS, REFERENCE_LINKS_MAX, REFERENCE_PACKAGE_NAME_MAX,
  REFERENCE_PACKAGES_MAX, REFERENCE_RESEARCH_MAX, ReferenceLinkStatus, ReferenceOrigin, ReferencePackageStatus,
  ReferencePackageVerdict, ReferenceResearchStatus,
} from './consts.js'
import type {
  MaterialGeneratedDoc, MaterialIndexEntry, MaterialLinkDetails, MaterialUse, ProjectMaterialRecord, ReferenceLink,
  ReferencePackage, ReferenceResearch, ReferencesLedger,
} from './types.js'

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

const idValue = { type: 'string', minLength: 1, maxLength: 64 } as const
const urlValue = { type: 'string', minLength: 1, maxLength: MATERIAL_LINK_URL_MAX } as const
const noteValue = { type: 'string', maxLength: MATERIAL_NOTE_MAX, nullable: true } as const
const countValue = { type: 'number', minimum: 0, nullable: true } as const
const packageName = { type: 'string', minLength: 1, maxLength: REFERENCE_PACKAGE_NAME_MAX } as const

/**
 * `details.link` of a fetched file's row. `details` itself stays an open object the collection
 * validator accepts; this schema is what a writer checks the provenance against.
 */
export const MaterialLinkDetailsSchema = {
  type: 'object',
  properties: {
    url: urlValue,
    linkId: idValue,
    intent: { type: 'string', enum: Object.values(MaterialLinkIntent) },
    own: { type: 'boolean' },
    primaryDesign: { type: 'boolean', nullable: true },
    completes: { ...pathValue, nullable: true },
  },
  required: ['url', 'linkId', 'intent', 'own'],
  additionalProperties: false,
} as unknown as JSONSchemaType<MaterialLinkDetails>

/** One link of `references.json`. */
export const ReferenceLinkSchema = {
  type: 'object',
  properties: {
    id: idValue,
    url: urlValue,
    normalized: urlValue,
    intents: {
      type: 'array', items: { type: 'string', enum: Object.values(MaterialLinkIntent) }, uniqueItems: true,
      maxItems: Object.values(MaterialLinkIntent).length,
    },
    own: { type: 'boolean' },
    instruction: noteValue,
    origin: { type: 'string', enum: [...REFERENCE_ASKED_ORIGINS] },
    status: { type: 'string', enum: Object.values(ReferenceLinkStatus) },
    reason: noteValue,
    folder: { ...pathValue, nullable: true },
    files: countValue,
    bytes: countValue,
    docs: { type: 'array', items: pathValue, maxItems: 16, nullable: true },
  },
  required: ['id', 'url', 'normalized', 'intents', 'own', 'origin', 'status'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ReferenceLink>

/** One online research request of `references.json`. */
export const ReferenceResearchSchema = {
  type: 'object',
  properties: {
    id: idValue,
    query: { type: 'string', minLength: 1, maxLength: MATERIAL_NOTE_MAX },
    instruction: noteValue,
    origin: { type: 'string', enum: [...REFERENCE_ASKED_ORIGINS] },
    status: { type: 'string', enum: Object.values(ReferenceResearchStatus) },
    reason: noteValue,
    doc: { ...pathValue, nullable: true },
    sources: countValue,
    gap: noteValue,
  },
  required: ['id', 'query', 'origin', 'status'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ReferenceResearch>

/** One named package of `references.json`. */
export const ReferencePackageSchema = {
  type: 'object',
  properties: {
    name: packageName,
    origin: { type: 'string', enum: Object.values(ReferenceOrigin) },
    verdict: { type: 'string', enum: [...Object.values(ReferencePackageVerdict), null], nullable: true },
    reasons: { type: 'array', items: { type: 'string', maxLength: MATERIAL_NOTE_MAX }, maxItems: 16, nullable: true },
    lookalikeOf: { ...packageName, nullable: true },
    skill: { type: 'string', minLength: 1, maxLength: MATERIAL_SKILL_NAME_MAX, nullable: true },
    status: { type: 'string', enum: Object.values(ReferencePackageStatus) },
    reason: noteValue,
  },
  required: ['name', 'origin', 'status'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ReferencePackage>

/** `docs/materials/references.json`. */
export const ReferencesLedgerSchema = {
  type: 'object',
  properties: {
    version: { type: 'number', minimum: 1 },
    links: { type: 'array', items: ReferenceLinkSchema, maxItems: REFERENCE_LINKS_MAX },
    research: { type: 'array', items: ReferenceResearchSchema, maxItems: REFERENCE_RESEARCH_MAX },
    packages: { type: 'array', items: ReferencePackageSchema, maxItems: REFERENCE_PACKAGES_MAX },
    updatedAt: { type: 'string', maxLength: 64, nullable: true },
  },
  required: ['version', 'links', 'research', 'packages'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ReferencesLedger>

/** One generated document of the index's generated-documents section. */
export const MaterialGeneratedDocSchema = {
  type: 'object',
  properties: {
    path: pathValue,
    title: { type: 'string', maxLength: MATERIAL_NAME_MAX },
    kind: { type: 'string', enum: Object.values(MaterialGeneratedKind) },
  },
  required: ['path', 'title', 'kind'],
  additionalProperties: false,
} as unknown as JSONSchemaType<MaterialGeneratedDoc>
