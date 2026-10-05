export const TitleSchema = { type: 'string', minLength: 0, maxLength: 256 } as const

/** A pairwise subject: `<clientId>:<digest>`. Never a path separator, never whitespace. */
export const ProfileIdSchema = { type: 'string', minLength: 1, maxLength: 256, pattern: '^[^/\\s]+$' } as const

export const PermissionNameSchema = { type: 'string', minLength: 1, maxLength: 128 } as const

export const EmailSchema = { type: 'string', format: 'email', minLength: 3, maxLength: 254 } as const

export const ResourcesSchema = {
  type: 'array', items: { type: 'string', minLength: 1, maxLength: 128 }, maxItems: 256, nullable: true,
} as const

export const aliases = {
  base: 'iam-runtime',
  organization: { list: 'iam-runtime:organization:list', create: 'iam-runtime:organization:create', update: 'iam-runtime:organization:update' },
  member: {
    list: 'iam-runtime:member:list', add: 'iam-runtime:member:add',
    update: 'iam-runtime:member:update', remove: 'iam-runtime:member:remove',
  },
  permission: { list: 'iam-runtime:permission:list' },
  grant: { list: 'iam-runtime:grant:list', assign: 'iam-runtime:grant:assign', revoke: 'iam-runtime:grant:revoke' },
} as const

/** Keys a facet stand-in answers `undefined` for, so it is never mistaken for a thenable or a primitive. */
export const INERT_KEYS = new Set<PropertyKey>(['then', 'toJSON'])
