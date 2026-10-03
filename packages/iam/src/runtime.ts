import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import type { EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { EntitySlugValueSchema, GroupValueSchema } from '@owlmeans/auth'
import type { JSONSchemaType } from 'ajv'
import { IAM_RUNTIME_GUARD, IAM_RUNTIME_PATH, IAM_RUNTIME_ROUTES, IamDefaultClass, IamGrantMode, IamGrantOrigin } from './consts.js'

// ---------------------------------------------------------------------------------------------
// Wire shapes. Organizations travel by `entitySlug` only; a subject is the CALLING client's
// pairwise `profileId`. Neither an organization id nor an account id ever appears here.
// ---------------------------------------------------------------------------------------------

/** One organization of the calling subject. */
export interface IamRuntimeOrganization {
  entitySlug: string
  title?: string
  owner: boolean
  groups?: string[]
  home?: boolean
}

export interface IamRuntimeOrganizationList {
  items: IamRuntimeOrganization[]
}

export interface IamRuntimeOrganizationCreate {
  title?: string
}

export interface IamRuntimeOrganizationUpdate {
  title: string
}

export interface IamRuntimeOrganizationParams {
  entitySlug: string
}

export interface IamRuntimeMember {
  profileId: string
  email?: string
  name?: string
  owner: boolean
  groups: string[]
  managed?: boolean
}

export interface IamRuntimeMemberList {
  items: IamRuntimeMember[]
}

/** Find-or-create by e-mail; adding someone twice answers the same member. */
export interface IamRuntimeMemberInvite {
  email: string
  name?: string
  owner?: boolean
}

export interface IamRuntimeMemberUpdate {
  owner?: boolean
  groups?: string[]
}

export interface IamRuntimeMemberParams {
  entitySlug: string
  profileId: string
}

/** A definition of the calling client that can be granted in an organization. */
export interface IamRuntimePermission {
  name: string
  title?: string
  area?: string
  resourceScoped?: boolean
  managed?: boolean
  defaultClass?: IamDefaultClass
}

export interface IamRuntimePermissionList {
  items: IamRuntimePermission[]
}

/** A grant of a member in the organization; `through` names the group a `Group`-origin one comes from. */
export interface IamRuntimeGrant {
  profileId: string
  permission: string
  resources?: string[]
  mode?: IamGrantMode
  origin?: IamGrantOrigin
  through?: string
}

export interface IamRuntimeGrantList {
  items: IamRuntimeGrant[]
}

export interface IamRuntimeGrantQuery {
  profileId?: string
}

/** Grant or revoke. The binding is the path's organization — the body cannot name another. */
export interface IamRuntimeGrantRequest {
  profileId: string
  permission: string
  resources?: string[]
  mode?: IamGrantMode
}

export interface IamRuntimeAck {
  ok: boolean
}

// ---------------------------------------------------------------------------------------------
// Schemas — closed throughout: the server's AJV strips an undeclared key silently, so a field a
// caller sends and the schema omits would vanish without an error.
// ---------------------------------------------------------------------------------------------

const TitleSchema = { type: 'string', minLength: 0, maxLength: 256 } as const

/** A pairwise subject: `<clientId>:<digest>`. Never a path separator, never whitespace. */
const ProfileIdSchema = { type: 'string', minLength: 1, maxLength: 256, pattern: '^[^/\\s]+$' } as const

const PermissionNameSchema = { type: 'string', minLength: 1, maxLength: 128 } as const

const EmailSchema = { type: 'string', format: 'email', minLength: 3, maxLength: 254 } as const

const ResourcesSchema = {
  type: 'array', items: { type: 'string', minLength: 1, maxLength: 128 }, maxItems: 256, nullable: true,
} as const

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

export const IamRuntimeOrganizationCreateSchema: JSONSchemaType<IamRuntimeOrganizationCreate> = {
  type: 'object',
  properties: { title: { ...TitleSchema, nullable: true } },
  required: [],
  additionalProperties: false,
}

export const IamRuntimeOrganizationUpdateSchema: JSONSchemaType<IamRuntimeOrganizationUpdate> = {
  type: 'object',
  properties: { title: { ...TitleSchema } },
  required: ['title'],
  additionalProperties: false,
}

export const IamRuntimeOrganizationParamsSchema: JSONSchemaType<IamRuntimeOrganizationParams> = {
  type: 'object',
  properties: { entitySlug: { ...EntitySlugValueSchema } },
  required: ['entitySlug'],
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

export const IamRuntimeMemberInviteSchema: JSONSchemaType<IamRuntimeMemberInvite> = {
  type: 'object',
  properties: {
    email: { ...EmailSchema },
    name: { ...TitleSchema, nullable: true },
    owner: { type: 'boolean', nullable: true },
  },
  required: ['email'],
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

export const IamRuntimeMemberParamsSchema: JSONSchemaType<IamRuntimeMemberParams> = {
  type: 'object',
  properties: {
    entitySlug: { ...EntitySlugValueSchema },
    profileId: { ...ProfileIdSchema },
  },
  required: ['entitySlug', 'profileId'],
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

export const IamRuntimeGrantQuerySchema: JSONSchemaType<IamRuntimeGrantQuery> = {
  type: 'object',
  properties: { profileId: { ...ProfileIdSchema, nullable: true } },
  required: [],
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

export const IamRuntimeAckSchema: JSONSchemaType<IamRuntimeAck> = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
  additionalProperties: false,
}

// ---------------------------------------------------------------------------------------------
// The protocol tree
// ---------------------------------------------------------------------------------------------

const aliases = {
  base: 'iam-runtime',
  organization: { list: 'iam-runtime:organization:list', create: 'iam-runtime:organization:create', update: 'iam-runtime:organization:update' },
  member: {
    list: 'iam-runtime:member:list', add: 'iam-runtime:member:add',
    update: 'iam-runtime:member:update', remove: 'iam-runtime:member:remove',
  },
  permission: { list: 'iam-runtime:permission:list' },
  grant: { list: 'iam-runtime:grant:list', assign: 'iam-runtime:grant:assign', revoke: 'iam-runtime:grant:revoke' },
} as const

export interface IamRuntimeProtocolOptions {
  /** The service alias that serves the API — every route, the base included, is pinned to it. */
  service: string
  /** The base path under that service. Defaults to `IAM_RUNTIME_PATH`. */
  path?: string
}

export type IamRuntimeProtocols = ReturnType<typeof declareRuntime>

const declareRuntime = (opts: IamRuntimeProtocolOptions) => {
  const { service } = opts
  const base: EntrypointProtocol<OpenRequest, OpenValue> = openProtocol(
    route(aliases.base, opts.path ?? IAM_RUNTIME_PATH, backend({ service })),
    { guards: IAM_RUNTIME_GUARD },
  )
  // A route's service is never inherited from its parent, so each leaf names it too: a leaf left
  // unpinned would be mounted by every process that happens to bind the tree.
  const leaf = (alias: string, path: string, method: RouteMethod) =>
    route(alias, path, backend({ parent: base, service }, method))

  return Object.freeze({
    base,

    organizations: Object.freeze({
      /** Any subject: its own organizations. */
      list: protocol(
        leaf(aliases.organization.list, IAM_RUNTIME_ROUTES.organizations, RouteMethod.GET),
        contract(typed<IamRuntimeOrganizationList>(IamRuntimeOrganizationListSchema)),
      ),
      /** Any subject of a tenanted client; the caller becomes its owner. */
      create: protocol(
        leaf(aliases.organization.create, IAM_RUNTIME_ROUTES.organizations, RouteMethod.POST),
        contract.request(
          { body: typed<IamRuntimeOrganizationCreate>(IamRuntimeOrganizationCreateSchema) },
          typed<IamRuntimeOrganization>(IamRuntimeOrganizationSchema),
        ),
      ),
      /** Owner. */
      update: protocol(
        leaf(aliases.organization.update, IAM_RUNTIME_ROUTES.organization, RouteMethod.POST),
        contract.request({
          params: typed<IamRuntimeOrganizationParams>(IamRuntimeOrganizationParamsSchema),
          body: typed<IamRuntimeOrganizationUpdate>(IamRuntimeOrganizationUpdateSchema),
        }, typed<IamRuntimeOrganization>(IamRuntimeOrganizationSchema)),
      ),
    }),

    members: Object.freeze({
      /** Member. */
      list: protocol(
        leaf(aliases.member.list, IAM_RUNTIME_ROUTES.members, RouteMethod.GET),
        contract.request(
          { params: typed<IamRuntimeOrganizationParams>(IamRuntimeOrganizationParamsSchema) },
          typed<IamRuntimeMemberList>(IamRuntimeMemberListSchema),
        ),
      ),
      /** Owner. Find-or-create by e-mail, idempotent. */
      add: protocol(
        leaf(aliases.member.add, IAM_RUNTIME_ROUTES.members, RouteMethod.POST),
        contract.request({
          params: typed<IamRuntimeOrganizationParams>(IamRuntimeOrganizationParamsSchema),
          body: typed<IamRuntimeMemberInvite>(IamRuntimeMemberInviteSchema),
        }, typed<IamRuntimeMember>(IamRuntimeMemberSchema)),
      ),
      /** Owner. */
      update: protocol(
        leaf(aliases.member.update, IAM_RUNTIME_ROUTES.member, RouteMethod.POST),
        contract.request({
          params: typed<IamRuntimeMemberParams>(IamRuntimeMemberParamsSchema),
          body: typed<IamRuntimeMemberUpdate>(IamRuntimeMemberUpdateSchema),
        }, typed<IamRuntimeMember>(IamRuntimeMemberSchema)),
      ),
      /** Owner, or the member itself. */
      remove: protocol(
        leaf(aliases.member.remove, IAM_RUNTIME_ROUTES.memberRemove, RouteMethod.POST),
        contract.request(
          { params: typed<IamRuntimeMemberParams>(IamRuntimeMemberParamsSchema) },
          typed<IamRuntimeAck>(IamRuntimeAckSchema),
        ),
      ),
    }),

    permissions: Object.freeze({
      /** Member. */
      list: protocol(
        leaf(aliases.permission.list, IAM_RUNTIME_ROUTES.permissions, RouteMethod.GET),
        contract.request(
          { params: typed<IamRuntimeOrganizationParams>(IamRuntimeOrganizationParamsSchema) },
          typed<IamRuntimePermissionList>(IamRuntimePermissionListSchema),
        ),
      ),
    }),

    grants: Object.freeze({
      /** Owner. */
      list: protocol(
        leaf(aliases.grant.list, IAM_RUNTIME_ROUTES.grants, RouteMethod.GET),
        contract.request({
          params: typed<IamRuntimeOrganizationParams>(IamRuntimeOrganizationParamsSchema),
          query: typed<IamRuntimeGrantQuery>(IamRuntimeGrantQuerySchema),
        }, typed<IamRuntimeGrantList>(IamRuntimeGrantListSchema)),
      ),
      /** Owner. */
      assign: protocol(
        leaf(aliases.grant.assign, IAM_RUNTIME_ROUTES.grants, RouteMethod.POST),
        contract.request({
          params: typed<IamRuntimeOrganizationParams>(IamRuntimeOrganizationParamsSchema),
          body: typed<IamRuntimeGrantRequest>(IamRuntimeGrantRequestSchema),
        }, typed<IamRuntimeGrant>(IamRuntimeGrantSchema)),
      ),
      /** Owner. */
      revoke: protocol(
        leaf(aliases.grant.revoke, IAM_RUNTIME_ROUTES.grantsRevoke, RouteMethod.POST),
        contract.request({
          params: typed<IamRuntimeOrganizationParams>(IamRuntimeOrganizationParamsSchema),
          body: typed<IamRuntimeGrantRequest>(IamRuntimeGrantRequestSchema),
        }, typed<IamRuntimeAck>(IamRuntimeAckSchema)),
      ),
    }),
  })
}

/**
 * Declare the runtime IAM API — the provider-side surface a tenanted client's server calls on behalf
 * of its signed-in subject: the subject's organizations, their members, the grantable definitions
 * and the grants inside one organization.
 *
 * Every leaf hangs under ONE base carrying `IAM_RUNTIME_GUARD`, so none can be reached without the
 * provider's own access token; the caller's client and account come from that token, the
 * organization from the path. Owner/member checks, the tenancy-config gate and the write rules are
 * the serving process's — a declaration decides nothing.
 */
export const makeIamRuntimeProtocols = (opts: IamRuntimeProtocolOptions): IamRuntimeProtocols => declareRuntime(opts)
