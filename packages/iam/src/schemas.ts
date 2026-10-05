import { EntitySlugValueSchema, GroupValueSchema } from '@owlmeans/auth'
import type { JSONSchemaType } from 'ajv'
import { IamDefaultClass, IamGrantMode, IamGrantOrigin } from './consts.js'
import { EmailSchema, PermissionNameSchema, ProfileIdSchema, ResourcesSchema, TitleSchema } from './consts.local.js'
import type { IamRuntimeGrant, IamRuntimeGrantList, IamRuntimeGrantRequest, IamRuntimeMember, IamRuntimeMemberList, IamRuntimeMemberUpdate, IamRuntimeOrganization, IamRuntimeOrganizationList, IamRuntimePermission, IamRuntimePermissionList } from './runtime/types.js'

// ---------------------------------------------------------------------------------------------
// Wire shapes. Organizations travel by `entitySlug` only; a subject is the CALLING client's
// pairwise `profileId`. Neither an organization id nor an account id ever appears here.
// ---------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------
// Schemas — closed throughout: the server's AJV strips an undeclared key silently, so a field a
// caller sends and the schema omits would vanish without an error.
// ---------------------------------------------------------------------------------------------

const GroupsSchema = { type: 'array', items: { ...GroupValueSchema }, maxItems: 64 } as const

export const IamRuntimeOrganizationSchema: JSONSchemaType<IamRuntimeOrganization> = {
  type: 'object',
  properties: {
    entitySlug: { ...EntitySlugValueSchema },
    title: { ...TitleSchema, nullable: true },
    owner: { type: 'boolean' },
    groups: { ...GroupsSchema, nullable: true },
    home: { type: 'boolean', nullable: true },
  },
  required: ['entitySlug', 'owner'],
  additionalProperties: false,
}

export const IamRuntimeOrganizationListSchema: JSONSchemaType<IamRuntimeOrganizationList> = {
  type: 'object',
  properties: { items: { type: 'array', items: IamRuntimeOrganizationSchema } },
  required: ['items'],
  additionalProperties: false,
}

export const IamRuntimeMemberSchema: JSONSchemaType<IamRuntimeMember> = {
  type: 'object',
  properties: {
    profileId: { ...ProfileIdSchema },
    email: { ...EmailSchema, nullable: true },
    name: { ...TitleSchema, nullable: true },
    owner: { type: 'boolean' },
    groups: { ...GroupsSchema },
    managed: { type: 'boolean', nullable: true },
  },
  required: ['profileId', 'owner', 'groups'],
  additionalProperties: false,
}

export const IamRuntimeMemberListSchema: JSONSchemaType<IamRuntimeMemberList> = {
  type: 'object',
  properties: { items: { type: 'array', items: IamRuntimeMemberSchema } },
  required: ['items'],
  additionalProperties: false,
}

export const IamRuntimeMemberUpdateSchema: JSONSchemaType<IamRuntimeMemberUpdate> = {
  type: 'object',
  properties: {
    owner: { type: 'boolean', nullable: true },
    groups: { ...GroupsSchema, nullable: true },
  },
  required: [],
  additionalProperties: false,
}

export const IamRuntimePermissionSchema: JSONSchemaType<IamRuntimePermission> = {
  type: 'object',
  properties: {
    name: { ...PermissionNameSchema },
    title: { ...TitleSchema, nullable: true },
    area: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
    resourceScoped: { type: 'boolean', nullable: true },
    managed: { type: 'boolean', nullable: true },
    defaultClass: { type: 'string', enum: Object.values(IamDefaultClass), nullable: true },
  },
  required: ['name'],
  additionalProperties: false,
}

export const IamRuntimePermissionListSchema: JSONSchemaType<IamRuntimePermissionList> = {
  type: 'object',
  properties: { items: { type: 'array', items: IamRuntimePermissionSchema } },
  required: ['items'],
  additionalProperties: false,
}

export const IamRuntimeGrantSchema: JSONSchemaType<IamRuntimeGrant> = {
  type: 'object',
  properties: {
    profileId: { ...ProfileIdSchema },
    permission: { ...PermissionNameSchema },
    resources: { ...ResourcesSchema },
    mode: { type: 'string', enum: Object.values(IamGrantMode), nullable: true },
    origin: { type: 'string', enum: Object.values(IamGrantOrigin), nullable: true },
    through: { ...GroupValueSchema, nullable: true },
  },
  required: ['profileId', 'permission'],
  additionalProperties: false,
}

export const IamRuntimeGrantListSchema: JSONSchemaType<IamRuntimeGrantList> = {
  type: 'object',
  properties: { items: { type: 'array', items: IamRuntimeGrantSchema } },
  required: ['items'],
  additionalProperties: false,
}

export const IamRuntimeGrantRequestSchema: JSONSchemaType<IamRuntimeGrantRequest> = {
  type: 'object',
  properties: {
    profileId: { ...ProfileIdSchema },
    permission: { ...PermissionNameSchema },
    resources: { ...ResourcesSchema },
    mode: { type: 'string', enum: Object.values(IamGrantMode), nullable: true },
  },
  required: ['profileId', 'permission'],
  additionalProperties: false,
}
