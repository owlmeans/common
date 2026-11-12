import type { JSONSchemaType } from 'ajv'
import { AREA_KEY_MAX, AREA_KEY_PATTERN, AREA_LABEL_MAX, AREA_SEGMENT_PATTERN, ProjectArea } from '../areas/consts.js'
import type { AreaDescriptor } from '../areas/types.js'
import {
  APP_NAME_PATTERN, APP_PACKAGE_DIR_PATTERN, APPS_DECISION_SOURCES, APPS_QUOTE_MAX, TARGET_APP_MAX_APPS,
  TARGET_APP_MAX_INDEX, TARGET_APP_MOUNT_OR_ROOT_PATTERN, TARGET_AREA_MAX,
} from './apps/consts.js'
import type { AppDescriptor, SlotAppClaim, ViableAppsDecision } from './apps/types.js'

/**
 * The app-map records, as the project card and the slot store them.
 *
 * Record-element schemas: hand-written and cast, every optional key nullable with its type, no
 * `integer` (a stored number is a double — an index is a `number` with `multipleOf: 1`). The SHAPE
 * is checked here; the rules between entries (guest in main, one app per area, reserved mounts) are
 * `appMapHelper.validate`'s, applied by whoever writes a map.
 */

/** One area of a project's map. */
export const AreaDescriptorSchema = {
  type: 'object',
  properties: {
    key: { type: 'string', minLength: 1, maxLength: AREA_KEY_MAX, pattern: AREA_KEY_PATTERN.source },
    kind: { type: 'string', enum: Object.values(ProjectArea) },
    segment: { type: 'string', maxLength: 31, pattern: AREA_SEGMENT_PATTERN.source },
    label: { type: 'string', minLength: 1, maxLength: AREA_LABEL_MAX, nullable: true },
    marker: { type: 'string', minLength: 1, maxLength: AREA_KEY_MAX + 9, nullable: true },
  },
  required: ['key', 'kind', 'segment'],
  additionalProperties: false,
} as unknown as JSONSchemaType<AreaDescriptor>

/** One app of a project's map. */
export const AppDescriptorSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 16, pattern: APP_NAME_PATTERN.source },
    mount: { type: 'string', maxLength: 31, pattern: TARGET_APP_MOUNT_OR_ROOT_PATTERN.source },
    areas: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: AREA_KEY_MAX, pattern: AREA_KEY_PATTERN.source },
      minItems: 1,
      maxItems: TARGET_AREA_MAX,
    },
    web: { type: 'string', minLength: 1, maxLength: 64, pattern: APP_PACKAGE_DIR_PATTERN.source },
    api: { type: 'string', minLength: 1, maxLength: 64, pattern: APP_PACKAGE_DIR_PATTERN.source },
    index: { type: 'number', minimum: 0, maximum: TARGET_APP_MAX_INDEX, multipleOf: 1 },
  },
  required: ['name', 'mount', 'areas', 'web', 'api', 'index'],
  additionalProperties: false,
} as unknown as JSONSchemaType<AppDescriptor>

/** The project card's `fields.apps`: the map, who decided it, the quoted request and when. */
export const ViableAppsDecisionSchema = {
  type: 'object',
  properties: {
    areas: { type: 'array', items: AreaDescriptorSchema, minItems: 1, maxItems: TARGET_AREA_MAX },
    apps: { type: 'array', items: AppDescriptorSchema, minItems: 1, maxItems: TARGET_APP_MAX_APPS },
    by: { type: 'string', enum: [...APPS_DECISION_SOURCES] },
    quote: { type: 'string', minLength: 1, maxLength: APPS_QUOTE_MAX, nullable: true },
    // No `format`: the planning registry compiles without ajv-formats.
    at: { type: 'string', minLength: 1, maxLength: 32 },
  },
  required: ['areas', 'apps', 'by', 'at'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ViableAppsDecision>

/**
 * One app a slot pins (`slot.apps`). Deliberately loose — no name or mount pattern: an agent newer
 * than this schema may claim a shape it does not know, and a slot record that fails validation is a
 * slot nothing can write again.
 */
export const SlotAppClaimSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 32 },
    mount: { type: 'string', maxLength: 64 },
    index: { type: 'number', minimum: 0, multipleOf: 1 },
  },
  required: ['name', 'mount', 'index'],
  additionalProperties: false,
} as unknown as JSONSchemaType<SlotAppClaim>
