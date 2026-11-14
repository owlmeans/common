import { z } from 'zod'
import { ProjectStatusOutput } from '../work/schemas.js'

/** One indented frame of a stack trace — never part of what a person reads. */
export const STACK_LINE = /^\s+at\s/

/** The slot's project root inside its pod: a path under it is given relative to the project. */
export const SANDBOX_ROOT = /\/var\/sandbox\//g

/** The calendar day an ISO timestamp starts with. */
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}/

/** A value that already names its scheme. */
export const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

/*
 * The declared structured output of every platform-domain tool under a listing profile.
 *
 * Statuses, kinds and modes stay plain strings: these views cross a version skew, and a newer
 * platform may answer with a value this schema has never heard of — a schema that refused it would
 * turn a working tool into a failing one. A field some branch of a tool leaves out is optional.
 */

const PROJECT_ID = z.string().describe('The project — what every follow-up call names as projectId.')
const SCOPE = z.string().optional().describe('production: the published site\'s own set; absent: the preview\'s.')
const DAY = z.string().optional().describe('A calendar day, YYYY-MM-DD.')

// --- settings, configuration, branding ---------------------------------------------------------

const SETTINGS = z.object({
  copyright: z.string(),
  organizationName: z.string(),
  termsUrl: z.string(),
  privacyUrl: z.string(),
  googleTag: z.string(),
  credit: z.object({
    hidden: z.boolean().describe('The credit is hidden in the application.'),
    requested: z.boolean().describe('The owner asked to hide it.'),
    entitled: z.boolean().describe('The plan includes hiding it (white label).'),
  }).optional(),
})

export const SETTINGS_OUTPUT = { projectId: PROJECT_ID, scope: SCOPE, settings: SETTINGS }

export const CONFIGURATION_OUTPUT = {
  projectId: PROJECT_ID,
  configuration: z.object({
    scope: z.string(),
    backend: z.array(z.object({
      name: z.string(),
      set: z.boolean().describe('A value is stored; the value itself is a secret and never shown.'),
    })),
    frontend: z.array(z.object({ name: z.string(), set: z.boolean(), value: z.string() })),
  }),
}

export const ORGANIZATION_BRANDING_OUTPUT = {
  organization: z.object({ organizationName: z.string(), copyright: z.string() }),
}

export const BACKFILL_OUTPUT = { projects: z.number().describe('Projects whose blank settings were filled.') }

// --- account -------------------------------------------------------------------------------------

export const TOKENS_OUTPUT = {
  total: z.number(),
  tokens: z.array(z.object({
    id: z.string().describe('What revoke_access_token names.'),
    name: z.string(),
    display: z.string().describe('The visible prefix — useless as a credential.'),
    scopes: z.array(z.string()),
    oauth: z.boolean().describe('Issued through a browser sign-in rather than created by hand.'),
    revoked: z.boolean(),
    created: DAY,
    lastUsed: DAY,
    expires: DAY,
  })),
}

export const TOKEN_REVOKED_OUTPUT = { tokenId: z.string() }

const PRIVACY = z.object({
  pending: z.boolean().describe('A consent still waits for the person\'s first or revised answer.'),
  items: z.array(z.object({
    key: z.string().describe('What withdraw_marketing_consent names.'),
    group: z.string(),
    mode: z.string(),
    granted: z.boolean(),
    status: z.string(),
    decided: DAY,
  })),
})

export const PRIVACY_OUTPUT = { privacy: PRIVACY }

export const WITHDRAW_OUTPUT = { withdrawn: z.array(z.string()), privacy: PRIVACY.optional() }

export const INTENT_OUTPUT = { prompt: z.string() }

// --- files and the preview -----------------------------------------------------------------------

export const FILES_OUTPUT = {
  projectId: PROJECT_ID,
  kind: z.string().describe('sources, stories, meta or all.'),
  category: z.string().optional(),
  total: z.number(),
  files: z.array(z.string()).describe('Paths relative to the project root, as read_file takes them.'),
}

export const FILE_READ_OUTPUT = {
  projectId: PROJECT_ID,
  path: z.string(),
  length: z.number().describe('The whole file\'s length in characters.'),
  truncated: z.boolean().describe('The text carries only the first part of the file.'),
}

export const FILE_WRITTEN_OUTPUT = {
  projectId: PROJECT_ID,
  path: z.string(),
  previewRebuilt: z.boolean().describe('False: the rebuild failed and the last good preview still serves.'),
  buildWarning: z.string().optional(),
}

const WORKLOAD = z.object({
  status: z.string(),
  url: z.string().optional().describe('The address a person opens.'),
  initialized: z.boolean().optional(),
  warnings: z.array(z.string()),
})

export const PREVIEW_OUTPUT = { projectId: PROJECT_ID, preview: WORKLOAD.nullable() }

// --- a new project's files ----------------------------------------------------------------------

const MATERIAL_OUTCOME = z.object({
  path: z.string(),
  status: z.string().describe('accepted, rejected (by the platform), refused (before sending), failed (to send) or unreadable.'),
  reason: z.string().optional(),
  from: z.string().optional().describe('The archive the file was unpacked from.'),
})

export const PROJECT_WITH_FILES_OUTPUT = {
  ...ProjectStatusOutput,
  files: z.array(MATERIAL_OUTCOME),
  pending: z.boolean().describe('Files are still being sent; the upload is sealed after the last one.'),
  sealed: z.boolean().describe('The upload is sealed and the drafting started.'),
}

const MATERIAL_ENTRY = z.object({
  path: z.string().describe('What read_material takes.'),
  name: z.string(),
  size: z.number(),
  status: z.string().describe('received, catalogued, placed, removed or rejected.'),
  kind: z.string().optional(),
  purpose: z.string().optional(),
  description: z.string().optional(),
  reason: z.string().optional(),
  placedAt: z.string().optional().describe('Where the file now lives in the project\'s tree.'),
  from: z.string().optional(),
})

const REFERENCE_LINK = z.object({
  url: z.string(),
  status: z.string().describe('fetched, researched, skipped, refused or failed.'),
  reason: z.string().optional(),
  folder: z.string().optional().describe('Where its files are listed (links/…).'),
  files: z.number().optional(),
  docs: z.array(z.string()).optional().describe('The documents written from it — what read_material takes.'),
})

const REFERENCE_RESEARCH = z.object({
  query: z.string(),
  status: z.string(),
  reason: z.string().optional(),
  doc: z.string().optional().describe('Its report — what read_material takes.'),
  sources: z.number().optional(),
  gap: z.string().optional().describe('What the research could not establish.'),
})

const REFERENCE_PACKAGE = z.object({
  name: z.string(),
  status: z.string(),
  verdict: z.string().optional(),
  lookalikeOf: z.string().optional(),
  reason: z.string().optional(),
})

const GENERATED_DOC = z.object({
  path: z.string().describe('What read_material takes.'),
  title: z.string(),
  kind: z.string().describe('research, reference-summary, reference-design or skill.'),
})

export const MATERIALS_OUTPUT = {
  projectId: PROJECT_ID,
  state: z.string().nullable().describe('Where the files stand; null for a project created without files.'),
  files: z.number(),
  rejected: z.number(),
  lastError: z.string().optional(),
  entries: z.array(MATERIAL_ENTRY),
  references: z.object({
    links: z.array(REFERENCE_LINK),
    research: z.array(REFERENCE_RESEARCH),
    packages: z.array(REFERENCE_PACKAGE),
  }).optional().describe('What the prompt and the confirmed specification pointed at, and what became of each.'),
  generated: z.array(GENERATED_DOC).optional().describe('The documents the platform generated from the references.'),
}

export const MATERIAL_TEXT_OUTPUT = {
  projectId: PROJECT_ID,
  path: z.string(),
  source: z.string().nullable().describe('transcript, text, generated, or null for a file without text.'),
  length: z.number().describe('The whole text\'s length in characters.'),
  truncated: z.boolean().describe('The text carries only the first part.'),
}

// --- git and GitHub ------------------------------------------------------------------------------

const COMMIT = z.object({
  hash: z.string().describe('What git_revert names.'),
  shortHash: z.string(),
  subject: z.string(),
  author: z.string(),
  date: DAY,
})

const CONNECTION = z.object({
  githubLogin: z.string(),
  status: z.string().describe('connected, published or invalid.'),
  repoFullName: z.string().optional(),
  repoUrl: z.string().optional(),
})

const TREE = z.object({
  initialized: z.boolean(),
  branch: z.string(),
  head: COMMIT.nullable(),
  dirty: z.boolean(),
  changedFiles: z.number(),
  files: z.array(z.object({ path: z.string(), status: z.string() })),
  remoteUrl: z.string().nullable(),
  ahead: z.number().nullable(),
  behind: z.number().nullable(),
})

export const GIT_STATUS_OUTPUT = {
  projectId: PROJECT_ID,
  connection: CONNECTION.nullable(),
  git: TREE.nullable().describe('null while the preview is not ready — git lives in the preview.'),
}

export const GIT_HISTORY_OUTPUT = { projectId: PROJECT_ID, total: z.number(), commits: z.array(COMMIT) }

export const GIT_COMMIT_OUTPUT = { projectId: PROJECT_ID, commit: COMMIT.nullable() }

export const GIT_DISCARD_OUTPUT = { projectId: PROJECT_ID, git: TREE.nullable() }

export const GIT_REVERT_OUTPUT = {
  projectId: PROJECT_ID,
  hash: z.string().optional().describe('The commit gone back to.'),
  commit: COMMIT.nullable().describe('The new commit; null when the tree already matched.'),
  dbWarning: z.string().optional(),
}

export const GITHUB_AUTHORIZE_OUTPUT = {
  projectId: PROJECT_ID,
  authorizeUrl: z.string().describe('The address the user opens in their browser.'),
}

export const GITHUB_CONNECTION_OUTPUT = { projectId: PROJECT_ID, connection: CONNECTION.nullable() }

export const GITHUB_SYNC_OUTPUT = {
  projectId: PROJECT_ID,
  direction: z.string(),
  status: z.string(),
  ahead: z.number().nullable(),
  behind: z.number().nullable(),
  message: z.string().optional(),
}

export const GITHUB_DISCONNECTED_OUTPUT = { projectId: PROJECT_ID, connection: z.null() }

export const GITHUB_REPOSITORIES_OUTPUT = {
  projectId: PROJECT_ID,
  owner: z.string().optional(),
  repo: z.string().optional(),
  page: z.number(),
  hasMore: z.boolean(),
  repos: z.array(z.object({
    fullName: z.string(),
    name: z.string(),
    owner: z.string(),
    url: z.string(),
    private: z.boolean(),
    defaultBranch: z.string(),
    archived: z.boolean(),
    fork: z.boolean(),
    description: z.string().optional(),
    language: z.string().optional(),
    updated: DAY,
  })).optional(),
  branches: z.array(z.object({ name: z.string(), protected: z.boolean() })).optional(),
}

export const GITHUB_LINKED_OUTPUT = {
  projectId: PROJECT_ID,
  owner: z.string(),
  repo: z.string(),
  branch: z.string().optional(),
  connection: CONNECTION.nullable(),
}

// --- production ----------------------------------------------------------------------------------

const DOMAIN = z.object({
  generatedHost: z.string().describe('The site\'s own address; it serves whether or not a domain is attached.'),
  customDomain: z.string().optional(),
  status: z.string(),
  verified: DAY,
  records: z.array(z.object({
    type: z.string(),
    name: z.string(),
    value: z.string(),
    purpose: z.string().describe('traffic or certificate.'),
    providerStatus: z.string().optional(),
  })).describe('The DNS records the user creates at the domain\'s DNS provider; none once it is linked.'),
  message: z.string().optional(),
})

export const PRODUCTION_OUTPUT = {
  projectId: PROJECT_ID,
  site: WORKLOAD.nullable().describe('null: not published yet.'),
  domain: DOMAIN.nullable(),
}

export const CUSTOM_DOMAIN_OUTPUT = { projectId: PROJECT_ID, domain: DOMAIN.nullable() }

export const PRODUCTION_AUTH_OUTPUT = {
  projectId: PROJECT_ID,
  issuerUrl: z.string(),
  clientId: z.string().describe('The OIDC client a self-hosted copy is configured with.'),
  secretSet: z.boolean().describe('The client secret exists; it is never shown here.'),
  redirectUris: z.array(z.string()),
  siteUrl: z.string().optional(),
}

export const REDIRECTS_OUTPUT = { projectId: PROJECT_ID, redirectUris: z.array(z.string()) }

// --- the generated application's sign-in ---------------------------------------------------------

const PROFILE_ID = z.string().describe('The user, as manage_app_user, manage_app_grant and the member calls name them.')
const ENTITY_SLUG = z.string().describe('The organization, as every organization and group call names it.')
const EXTERNAL = z.boolean().optional().describe('Kept in a console of its own: the list is empty on purpose.')

const USER = z.object({
  profileId: PROFILE_ID,
  email: z.string().optional(),
  name: z.string().optional(),
  role: z.string(),
  disabled: z.boolean(),
  grantCount: z.number().optional(),
  home: z.string().optional(),
  memberships: z.array(z.object({
    entitySlug: ENTITY_SLUG,
    title: z.string().optional(),
    owner: z.boolean(),
    groups: z.array(z.string()),
    home: z.boolean().optional(),
  })).optional(),
})

export const APP_USERS_OUTPUT = {
  projectId: PROJECT_ID.optional(),
  scope: SCOPE,
  external: EXTERNAL,
  users: z.array(USER),
}

export const APP_USER_OUTPUT = {
  projectId: PROJECT_ID,
  profileId: PROFILE_ID,
  user: USER.optional(),
  removed: z.boolean().optional(),
}

const PERMISSION = z.object({
  name: z.string(),
  title: z.string().optional(),
  area: z.string().optional(),
  defaultClass: z.string().optional(),
  resourceScoped: z.boolean(),
  entityScoped: z.boolean(),
  managed: z.boolean(),
})

export const APP_PERMISSIONS_OUTPUT = {
  projectId: PROJECT_ID,
  tenancy: z.object({ operators: z.boolean(), users: z.boolean() }),
  external: EXTERNAL,
  permissions: z.array(PERMISSION),
}

export const APP_PERMISSION_OUTPUT = { projectId: PROJECT_ID, permission: PERMISSION }

const GROUP_REF = z.object({ entitySlug: ENTITY_SLUG, key: z.string() })

const GRANT = z.object({
  permission: z.string(),
  profileId: PROFILE_ID.optional(),
  group: GROUP_REF.optional(),
  entitySlug: ENTITY_SLUG.optional(),
  resources: z.array(z.string()).optional(),
  mode: z.string().optional(),
  origin: z.string().optional(),
  through: GROUP_REF.optional(),
  restricted: z.boolean().optional().describe('Withheld by the subject\'s own restriction — NOT held.'),
})

export const APP_GRANTS_OUTPUT = { projectId: PROJECT_ID, external: EXTERNAL, grants: z.array(GRANT) }

export const APP_GRANT_OUTPUT = { projectId: PROJECT_ID, grant: GRANT.optional(), revoked: GRANT.optional() }

const ORGANIZATION = z.object({ entitySlug: ENTITY_SLUG, title: z.string().optional(), members: z.number().optional() })

const MEMBER = z.object({
  profileId: PROFILE_ID,
  email: z.string().optional(),
  name: z.string().optional(),
  owner: z.boolean(),
  groups: z.array(z.string()),
  managed: z.boolean().optional(),
})

export const APP_ORGANIZATIONS_OUTPUT = {
  projectId: PROJECT_ID,
  entitySlug: ENTITY_SLUG.optional(),
  external: EXTERNAL,
  organizations: z.array(ORGANIZATION).optional(),
  members: z.array(MEMBER).optional(),
}

export const APP_ORGANIZATION_OUTPUT = {
  projectId: PROJECT_ID,
  entitySlug: ENTITY_SLUG,
  organization: ORGANIZATION.optional(),
  member: MEMBER.optional(),
  profileId: PROFILE_ID.optional(),
  removed: z.boolean().optional(),
}

const GROUP = z.object({
  key: z.string(),
  title: z.string().optional(),
  managed: z.boolean().optional().describe('The platform\'s own staff group: members, bundles and existence are its.'),
  members: z.number().optional(),
  bundles: z.array(z.object({
    permissions: z.array(z.string()).optional(),
    filter: z.object({
      areas: z.array(z.string().nullable()).optional(),
      managed: z.boolean().optional(),
      resourceScoped: z.boolean().optional(),
      entityScoped: z.boolean().optional(),
    }).optional(),
  })),
})

export const APP_GROUPS_OUTPUT = {
  projectId: PROJECT_ID,
  entitySlug: ENTITY_SLUG,
  group: z.string().optional().describe('The group whose members these are.'),
  external: EXTERNAL,
  groups: z.array(GROUP).optional(),
  members: z.array(MEMBER).optional(),
}

export const APP_GROUP_OUTPUT = {
  projectId: PROJECT_ID,
  entitySlug: ENTITY_SLUG,
  key: z.string().describe('The group key.'),
  group: GROUP.optional(),
  deleted: z.boolean().optional(),
  action: z.string().optional(),
  profileIds: z.array(z.string()).optional(),
}
