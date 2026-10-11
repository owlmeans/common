import type { JSONSchemaType } from 'ajv'
import { IamDefaultClass, type IamGroupRef } from '@owlmeans/iam'
import {
  EmailSchema, EntitySlugSchema, GroupBundleSchema, GroupKeySchema, ModeProp, NameSchema,
  PermissionNameSchema, ProfileIdSchema, ProfileIdsSchema, ProjectIdProp, ResourceIdSchema, RoleSchema, ScopeProp,
  TitleSchema,
} from './consts.local.js'
import type {
  IamAssignGrant, IamDefinitionUpdate, IamGrantsQuery, IamGroupCreate, IamGroupEdit, IamGroupMembersChange,
  IamGroupParams, IamMemberParams, IamOrganizationEdit, IamOrganizationParams, IamProjectMemberInvite,
  IamProjectMemberUpdate, IamProjectParams, IamProjectUserInvite, IamProjectUserParams, IamProjectUserUpdate,
  IamRevokeGrant, IamScoped, IamStaffSync,
} from './types.js'

/**
 * The owner console's IAM schemas — one set for both doors: the browser's `back.iam` routes and the
 * connector's `connect.iam` twins validate the same bodies, so a field cannot be admitted on one and
 * refused on the other. Every object is closed (`additionalProperties: false`): an organization's
 * record id (`entityId`) is refused wherever it is offered.
 */

export const IamProjectParamsSchema: JSONSchemaType<IamProjectParams> = {
  type: 'object',
  properties: { ...ProjectIdProp },
  required: ['projectId'],
  additionalProperties: false,
}

export const IamProjectUserParamsSchema: JSONSchemaType<IamProjectUserParams> = {
  type: 'object',
  properties: { ...ProjectIdProp, profileId: ProfileIdSchema },
  required: ['projectId', 'profileId'],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamProjectUserParams>

export const IamOrganizationParamsSchema: JSONSchemaType<IamOrganizationParams> = {
  type: 'object',
  properties: { ...ProjectIdProp, entitySlug: EntitySlugSchema },
  required: ['projectId', 'entitySlug'],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamOrganizationParams>

export const IamMemberParamsSchema: JSONSchemaType<IamMemberParams> = {
  type: 'object',
  properties: { ...ProjectIdProp, entitySlug: EntitySlugSchema, profileId: ProfileIdSchema },
  required: ['projectId', 'entitySlug', 'profileId'],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamMemberParams>

export const IamGroupRefSchema: JSONSchemaType<IamGroupRef> = {
  type: 'object',
  properties: {
    entitySlug: EntitySlugSchema,
    key: GroupKeySchema,
  },
  required: ['entitySlug', 'key'],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamGroupRef>

export const IamGroupParamsSchema: JSONSchemaType<IamGroupParams> = {
  type: 'object',
  properties: { ...ProjectIdProp, entitySlug: EntitySlugSchema, group: GroupKeySchema },
  required: ['projectId', 'entitySlug', 'group'],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamGroupParams>

/** The client a body-less write addresses, carried in the body where a route has one (`scope`). */
export const IamScopedSchema: JSONSchemaType<IamScoped> = {
  type: 'object',
  properties: { scope: ScopeProp },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamScoped>

/**
 * A person or a group, never both; a group always with the organization it lives in.
 *
 * `dependencies` rather than a handler check, so a malformed listing is a validation refusal like
 * every other — and the handler can rely on the shape it was handed.
 */
export const IamGrantsQuerySchema: JSONSchemaType<IamGrantsQuery> = {
  type: 'object',
  properties: {
    profileId: { ...ProfileIdSchema, nullable: true },
    group: { ...GroupKeySchema, nullable: true },
    entitySlug: { ...EntitySlugSchema, nullable: true },
    scope: ScopeProp,
  },
  required: [],
  additionalProperties: false,
  dependencies: { group: ['entitySlug'] },
  not: { required: ['profileId', 'group'] },
} as unknown as JSONSchemaType<IamGrantsQuery>

/**
 * Exactly one subject. Each branch excludes the other subject itself, so a body naming both
 * matches neither; the group branch also refuses a binding — a group grant is bound to the group's
 * own organization, and a second organization in the body could only disagree with it. Each branch
 * declares the property it requires, so a reader of the branch alone (a model-schema check) sees it.
 */
const OneSubject = [
  { properties: { profileId: ProfileIdSchema }, required: ['profileId'], not: { required: ['group'] } },
  {
    properties: { group: IamGroupRefSchema },
    required: ['group'],
    not: { anyOf: [{ required: ['profileId'] }, { required: ['entitySlug'] }] },
  },
] as const

const grantSchemaProperties = {
  profileId: { ...ProfileIdSchema, nullable: true },
  group: { ...IamGroupRefSchema, nullable: true },
  permission: PermissionNameSchema,
  resources: { type: 'array', items: ResourceIdSchema, maxItems: 256, nullable: true },
  mode: ModeProp,
  entitySlug: { ...EntitySlugSchema, nullable: true },
  scope: ScopeProp,
} as const

export const IamAssignGrantSchema: JSONSchemaType<IamAssignGrant> = {
  type: 'object',
  properties: grantSchemaProperties,
  required: ['permission'],
  additionalProperties: false,
  oneOf: OneSubject,
} as unknown as JSONSchemaType<IamAssignGrant>

export const IamRevokeGrantSchema: JSONSchemaType<IamRevokeGrant> = {
  type: 'object',
  properties: grantSchemaProperties,
  required: ['permission'],
  additionalProperties: false,
  oneOf: OneSubject,
} as unknown as JSONSchemaType<IamRevokeGrant>

const DefaultClassProp = { type: 'string', enum: [...Object.values(IamDefaultClass), null], nullable: true } as const
const EntityScopedProp = { type: 'boolean', nullable: true } as const

/** At least one setting: an update that changes nothing is a client bug, not a request. */
export const IamDefinitionUpdateSchema: JSONSchemaType<IamDefinitionUpdate> = {
  type: 'object',
  properties: {
    permission: PermissionNameSchema,
    defaultClass: DefaultClassProp,
    entityScoped: EntityScopedProp,
    scope: ScopeProp,
  },
  required: ['permission'],
  additionalProperties: false,
  // Each branch declares the property it requires, so a reader of the branch alone sees it.
  anyOf: [
    { properties: { defaultClass: DefaultClassProp }, required: ['defaultClass'] },
    { properties: { entityScoped: EntityScopedProp }, required: ['entityScoped'] },
  ],
} as unknown as JSONSchemaType<IamDefinitionUpdate>

export const IamStaffSyncSchema: JSONSchemaType<IamStaffSync> = {
  type: 'object',
  properties: { scope: ScopeProp },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamStaffSync>

export const IamProjectUserInviteSchema: JSONSchemaType<IamProjectUserInvite> = {
  type: 'object',
  properties: {
    email: EmailSchema,
    name: { ...NameSchema, nullable: true },
    role: { ...RoleSchema, nullable: true },
    scope: ScopeProp,
  },
  required: ['email'],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamProjectUserInvite>

export const IamProjectUserUpdateSchema: JSONSchemaType<IamProjectUserUpdate> = {
  type: 'object',
  properties: {
    name: { ...NameSchema, nullable: true },
    role: { ...RoleSchema, nullable: true },
    disabled: { type: 'boolean', nullable: true },
    scope: ScopeProp,
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamProjectUserUpdate>

export const IamOrganizationEditSchema: JSONSchemaType<IamOrganizationEdit> = {
  type: 'object',
  properties: {
    title: TitleSchema,
    scope: ScopeProp,
  },
  required: ['title'],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamOrganizationEdit>

export const IamProjectMemberInviteSchema: JSONSchemaType<IamProjectMemberInvite> = {
  type: 'object',
  properties: {
    email: EmailSchema,
    name: { ...NameSchema, nullable: true },
    owner: { type: 'boolean', nullable: true },
    scope: ScopeProp,
  },
  required: ['email'],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamProjectMemberInvite>

export const IamProjectMemberUpdateSchema: JSONSchemaType<IamProjectMemberUpdate> = {
  type: 'object',
  properties: {
    owner: { type: 'boolean', nullable: true },
    groups: { type: 'array', items: GroupKeySchema, maxItems: 64, nullable: true },
    scope: ScopeProp,
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamProjectMemberUpdate>

export const IamGroupCreateSchema: JSONSchemaType<IamGroupCreate> = {
  type: 'object',
  properties: {
    key: GroupKeySchema,
    title: { ...TitleSchema, nullable: true },
    scope: ScopeProp,
  },
  required: ['key'],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamGroupCreate>

export const IamGroupEditSchema: JSONSchemaType<IamGroupEdit> = {
  type: 'object',
  properties: {
    title: { ...TitleSchema, nullable: true },
    bundles: { type: 'array', items: GroupBundleSchema, maxItems: 32, nullable: true },
    scope: ScopeProp,
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamGroupEdit>

export const IamGroupMembersChangeSchema: JSONSchemaType<IamGroupMembersChange> = {
  type: 'object',
  properties: {
    profileIds: ProfileIdsSchema,
    scope: ScopeProp,
  },
  required: ['profileIds'],
  additionalProperties: false,
} as unknown as JSONSchemaType<IamGroupMembersChange>
