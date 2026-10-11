import { IdValueSchema, GroupValueSchema } from '@owlmeans/auth'
import { ENTITY_SLUG_PATTERN } from '@owlmeans/auth-common'
import { IamGrantMode } from '@owlmeans/iam'
import { WorkloadKind } from '../slot/consts.js'

// Canonical permission name (e.g. "department--modify" or bare "department") — IAM-specific,
// deliberately not reusing the auth ScopeValueSchema (maxLength 32) / ResourceValueSchema (minLength 8).
export const PermissionNameSchema = { type: 'string', minLength: 1, maxLength: 128 } as const

export const ResourceIdSchema = { type: 'string', minLength: 1, maxLength: 128 } as const

// The pairwise subject `<clientId>:<digest>` — a client id is `{entity}-{alias}[-production]`, so
// relaxed and long, but never a path separator or whitespace: it rides in route params.
export const ProfileIdSchema = { type: 'string', minLength: 1, maxLength: 256, pattern: '^[^/\\s]+$' } as const

// The organization's renameable name, exactly as the identity store's registry admits one.
export const EntitySlugSchema = { type: 'string', minLength: 1, maxLength: 63, pattern: ENTITY_SLUG_PATTERN.source } as const

export const EmailSchema = { type: 'string', minLength: 3, maxLength: 254 } as const

export const RoleSchema = { type: 'string', minLength: 1, maxLength: 32 } as const

export const NameSchema = { type: 'string', minLength: 1, maxLength: 128 } as const

export const TitleSchema = { type: 'string', minLength: 1, maxLength: 256 } as const

export const ProfileIdsSchema = { type: 'array', items: ProfileIdSchema, minItems: 1, maxItems: 256 } as const

// A nullable enum carries `null` among its values: `nullable` and `enum` are checked apart, and a
// connector serialises an unset optional as `null` as readily as it drops the key.
export const ScopeProp = { type: 'string', enum: [...Object.values(WorkloadKind), null], nullable: true } as const

// Declared, or `removeAdditional: true` strips it before the handler and every grant silently
// falls back to the inferred form.
export const ModeProp = { type: 'string', enum: [...Object.values(IamGrantMode), null], nullable: true } as const

export const ProjectIdProp = { projectId: IdValueSchema } as const

// A group key is a route param as well: the auth vocabulary's group value, never a path separator.
export const GroupKeySchema = {
  type: 'string', minLength: GroupValueSchema.minLength, maxLength: GroupValueSchema.maxLength, pattern: '^[^/\\s]+$',
} as { type: 'string', minLength: number, maxLength: number, pattern: string }

export const GroupBundleSchema = {
  type: 'object',
  properties: {
    filter: {
      type: 'object',
      properties: {
        areas: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 64, nullable: true }, maxItems: 16, nullable: true },
        managed: { type: 'boolean', nullable: true },
        resourceScoped: { type: 'boolean', nullable: true },
        entityScoped: { type: 'boolean', nullable: true },
      },
      required: [],
      additionalProperties: false,
      nullable: true,
    },
    permissions: { type: 'array', items: PermissionNameSchema, maxItems: 256, nullable: true },
  },
  required: [],
  additionalProperties: false,
} as const

