import type { JSONSchemaType } from 'ajv'
import { SpecCategory } from '../ba/consts.js'
import { ConversionDecision, OriginKind } from '../convert/consts.js'
import { MetadataListKind } from '../metadata/consts.js'
import {
  CONNECT_BRANDING_COPYRIGHT_MAX, CONNECT_BRANDING_GOOGLE_TAG_MAX,
  CONNECT_BRANDING_ORGANIZATION_MAX, CONNECT_BRANDING_URL_MAX, CONNECT_CALL_COLLECT_WAIT_SEC, CONNECT_FILE_PATH_MAX,
  CONNECT_CONFIG_NAME_MAX, CONNECT_CONFIG_NAME_PATTERN, CONNECT_CONFIG_SAVE_MAX, CONNECT_CONFIG_VALUE_MAX,
  CONNECT_GIT_HASH_PATTERN, CONNECT_GIT_MESSAGE_MAX, CONNECT_GITHUB_BRANCH_MAX, CONNECT_GITHUB_NAME_MAX,
  CONNECT_GITHUB_PAGE_MAX, CONNECT_GITHUB_SEARCH_MAX, CONNECT_DOMAIN_MAX, CONNECT_DOMAIN_MIN, CONNECT_DOMAIN_PATTERN,
  CONNECT_REDIRECT_URI_MAX, CONNECT_REDIRECTS_MAX,
  CONNECT_INQUIRY_MAX_TEXT, CONNECT_PRIVACY_KEY_MAX, CONNECT_PRIVACY_KEYS_MAX, CONNECT_TOKEN_ID_MAX, ConnectCallState, ConnectHarness, ConnectLlm, ConnectOpErrorKind,
  ConnectSessionStatus, ConnectTarget, ConnectTransport, ModelTaskResultKind,
  CONNECT_FEED_CURSOR_MAX, CONNECT_FEED_CURSOR_PATTERN, CONNECT_FEED_LIMIT_MAX, CONNECT_FEED_WAIT_MAX_SEC, ConnectFeedDetail,
} from './consts.js'
import { WorkloadKind } from '../slot/consts.js'
import { INTENT_REF_LENGTH, INTENT_REF_PATTERN } from '../intent/consts.js'
import type {
  ConnectAccessTokenParams, ConnectIntentPickupBody, ConnectOrganizationBrandingSave, ConnectPrivacyWithdrawBody,
} from './account/types.js'
import type { ConnectBrandingCreditBody, ConnectProjectBrandingSave } from './branding/types.js'
import type { ConnectConfigSaveBody, ConnectScopeQuery } from './config/types.js'
import type {
  ConnectCallCollectParams, ConnectCallCollectQuery, ConnectCallPending, ConnectCallResult
} from './call/types.js'
import type { ConnectConvertCreateBody, ConnectConvertProceedBody, ConnectConvertStartBody } from './conversion/types.js'
import type { ConnectFileMetaQuery, ConnectFileQuery, ConnectFileSaveBody } from './files/types.js'
import type { ConnectActivityQuery, ConnectFeedQuery } from './feed/types.js'
import type {
  ConnectGitCommitBody, ConnectGitRevertBody, ConnectGithubBranchQuery, ConnectGithubLinkBody, ConnectGithubPublishBody,
  ConnectGithubRepoQuery,
} from './git/types.js'
import type { ConnectKitApplyBody, ConnectKitApplyResult, ConnectKitDescribe, PlanningKitView } from './kit/types.js'
import type { ConnectOpResult, InquiryAnswerPayload } from './ops/types.js'
import type { ConnectPipelineParams, ConnectPipelineResumeBody } from './pipeline/types.js'
import type { ConnectAttachBody, ConnectConfirmBody, ConnectCreateBody, ConnectModifyBody, ConnectRenameBody } from './project/types.js'
import type { ConnectProductionDomainBody, ConnectProductionRedirectsBody } from './production/types.js'
import type {
  ConnectIamGroupParams, ConnectIamMemberParams, ConnectIamOrganizationParams, ConnectIamUserParams,
} from './iam/types.js'
import { EntitySlugSchema, GroupKeySchema, ProfileIdSchema } from '../iam-console/consts.local.js'
import type { ConnectPullQuery, ConnectSession, ConnectSessionOpen, ConnectSessionParams } from './session/types.js'
import type { ConnectLlmBody, ConnectProjectLlmBody } from './settings/types.js'

/**
 * A nullable ENUM carries `null` as one of its values.
 *
 * `nullable` and `enum` are separate Ajv keywords, checked independently: `nullable: true` widens
 * the TYPE check to admit `null` and the `enum` check then refuses the very same value, so the
 * field can only ever be OMITTED — never sent empty. That is not the same thing here. A connector
 * is somebody else's process putting JSON on the wire and it serialises an unset optional as
 * `null` as readily as it drops the key, and in `ConnectProjectLlmBody.llmMode` the `null` MEANS
 * something ("inherit the profile's setting") and has no other spelling. So every `enum` beside a
 * `nullable: true` is written `[...Object.values(X), null]`. `tests/convert.spec.ts` walks every
 * schema this package exports and fails on the pair written apart.
 */

const idValue = { type: 'string', minLength: 1, maxLength: 128 } as const

export const ConnectCapabilitiesSchema = {
  type: 'object',
  properties: {
    harness: { type: 'string', enum: Object.values(ConnectHarness) },
    tiers: {
      type: 'object',
      nullable: false,
      additionalProperties: { type: 'string', maxLength: 128 },
      required: [],
    },
    subagents: { type: 'boolean' },
    effortControl: { type: 'boolean' },
    // Deliberately NOT `enum: Object.values(ConnectExecutor)`. The SDK and the platform ship
    // separately, so a connector built against a newer package advertises an executor kind this
    // platform has never heard of — and an enum turns that into a refused session rather than an
    // unused capability. Forward tolerance: an unknown value is simply not matched by anything.
    executors: { type: 'array', items: { type: 'string', maxLength: 32 } },
    services: {
      type: 'object',
      nullable: true,
      properties: { db: { type: 'boolean' }, valkey: { type: 'boolean' } },
      required: ['db', 'valkey'],
      additionalProperties: false,
    },
  },
  required: ['harness', 'tiers', 'subagents', 'effortControl', 'executors'],
  additionalProperties: false,
} as any

export const ConnectSessionOpenSchema = {
  type: 'object',
  properties: {
    projectId: { ...idValue, nullable: true },
    projectDir: { type: 'string', maxLength: 4096, nullable: true },
    target: { type: 'string', enum: Object.values(ConnectTarget) },
    harness: { type: 'string', enum: Object.values(ConnectHarness) },
    clientVersion: { type: 'string', minLength: 1, maxLength: 64 },
    capabilities: ConnectCapabilitiesSchema,
  },
  required: ['target', 'harness', 'clientVersion', 'capabilities'],
  additionalProperties: false,
} as JSONSchemaType<ConnectSessionOpen>

export const ConnectSessionParamsSchema = {
  type: 'object',
  properties: { sessionId: idValue },
  required: ['sessionId'],
  additionalProperties: false,
} as JSONSchemaType<ConnectSessionParams>

/**
 * The session record's own shape.
 *
 * Applied as the collection's `$jsonSchema`, so every field the platform ever writes must be
 * declared here — a field added to the type and forgotten here fails every create with a
 * validation error that names the document rather than the field.
 */
export const ConnectSessionSchema = {
  type: 'object',
  properties: {
    id: { ...idValue, nullable: true },
    profileId: idValue,
    entityId: idValue,
    projectId: { ...idValue, nullable: true },
    projectDir: { type: 'string', maxLength: 4096, nullable: true },
    target: { type: 'string', enum: Object.values(ConnectTarget) },
    llm: { type: 'string', enum: Object.values(ConnectLlm) },
    harness: { type: 'string', enum: Object.values(ConnectHarness) },
    clientVersion: { type: 'string', maxLength: 64 },
    capabilities: ConnectCapabilitiesSchema,
    status: { type: 'string', enum: Object.values(ConnectSessionStatus) },
    transport: { type: 'string', enum: [...Object.values(ConnectTransport), null], nullable: true },
    openedAt: { type: 'object', format: 'date-time', required: [] },
    lastSeenAt: { type: 'object', format: 'date-time', required: [] },
    closedAt: { type: 'object', format: 'date-time', required: [], nullable: true },
    createdAt: { type: 'object', format: 'date-time', required: [] },
    updatedAt: { type: 'object', format: 'date-time', required: [], nullable: true },
  },
  required: [
    'profileId', 'entityId', 'target', 'llm', 'harness', 'clientVersion', 'capabilities',
    'status', 'openedAt', 'lastSeenAt', 'createdAt'
  ],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectSession>

export const ConnectOpResultSchema = {
  type: 'object',
  properties: {
    opId: idValue,
    sessionId: idValue,
    ok: { type: 'boolean' },
    // Any JSON, and it may be absent — a shell result is an object, a file read a string, a
    // listing an array. Declared as the empty schema rather than as `nullable`, because Ajv
    // refuses `nullable` without a `type` and Fastify compiles this schema at route
    // registration: the refusal takes the whole API down at boot, not the one call that would
    // have carried the value.
    value: {},
    error: {
      type: 'object',
      nullable: true,
      properties: {
        type: { type: 'string', maxLength: 256 },
        message: { type: 'string', maxLength: 8192 },
        kind: { type: 'string', enum: [...Object.values(ConnectOpErrorKind), null], nullable: true },
      },
      required: ['type', 'message'],
      additionalProperties: false,
    },
  },
  required: ['opId', 'sessionId', 'ok'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectOpResult>

export const ConnectPullQuerySchema = {
  type: 'object',
  properties: { wait: { type: 'integer', minimum: 0, maximum: 45, nullable: true } },
  required: [],
  additionalProperties: false,
} as JSONSchemaType<ConnectPullQuery>

/** The early answer to a delegated write: the call id it named, still running. */
export const ConnectCallPendingSchema = {
  type: 'object',
  properties: { pending: idValue },
  required: ['pending'],
  additionalProperties: false,
} as JSONSchemaType<ConnectCallPending>

export const ConnectCallCollectParamsSchema = {
  type: 'object',
  properties: { callId: idValue },
  required: ['callId'],
  additionalProperties: false,
} as JSONSchemaType<ConnectCallCollectParams>

export const ConnectCallCollectQuerySchema = {
  type: 'object',
  properties: { wait: { type: 'integer', minimum: 0, maximum: CONNECT_CALL_COLLECT_WAIT_SEC, nullable: true } },
  required: [],
  additionalProperties: false,
} as JSONSchemaType<ConnectCallCollectQuery>

/**
 * What a collect answers. `value` is any JSON the call would have answered with — the empty schema,
 * never `nullable` without a `type` (see ConnectOpResultSchema.value); `error` is the call's failure
 * as `ResilientError.marshal` writes it, stack included, so its ceiling is generous.
 */
export const ConnectCallResultSchema = {
  type: 'object',
  properties: {
    state: { type: 'string', enum: Object.values(ConnectCallState) },
    outcome: { type: 'string', maxLength: 32, nullable: true },
    value: {},
    error: { type: 'string', maxLength: 65_536, nullable: true },
  },
  required: ['state'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectCallResult>

/** Every project-scoped connector route addresses the project by `:id`. */
export const ConnectProjectIdSchema = {
  type: 'object',
  properties: { id: idValue },
  required: ['id'],
  additionalProperties: false,
} as JSONSchemaType<{ id: string }>

/**
 * The connector's IAM paths: the project as `id`, then the subject, the organization (its slug —
 * never its record id) and the group key, each bounded exactly like the browser's twin.
 */
export const ConnectIamUserParamsSchema = {
  type: 'object',
  properties: { id: idValue, profileId: ProfileIdSchema },
  required: ['id', 'profileId'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectIamUserParams>

export const ConnectIamOrganizationParamsSchema = {
  type: 'object',
  properties: { id: idValue, entitySlug: EntitySlugSchema },
  required: ['id', 'entitySlug'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectIamOrganizationParams>

export const ConnectIamMemberParamsSchema = {
  type: 'object',
  properties: { id: idValue, entitySlug: EntitySlugSchema, profileId: ProfileIdSchema },
  required: ['id', 'entitySlug', 'profileId'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectIamMemberParams>

export const ConnectIamGroupParamsSchema = {
  type: 'object',
  properties: { id: idValue, entitySlug: EntitySlugSchema, group: GroupKeySchema },
  required: ['id', 'entitySlug', 'group'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectIamGroupParams>

export const ConnectOpParamsSchema = {
  type: 'object',
  properties: { sessionId: idValue, opId: idValue },
  required: ['sessionId', 'opId'],
  additionalProperties: false,
} as JSONSchemaType<{ sessionId: string, opId: string }>

export const ConnectStoryParamsSchema = {
  type: 'object',
  properties: { id: idValue, storyId: idValue },
  required: ['id', 'storyId'],
  additionalProperties: false,
} as JSONSchemaType<{ id: string, storyId: string }>

export const ConnectCreateBodySchema = {
  type: 'object',
  properties: {
    prompt: { type: 'string', minLength: 1, maxLength: 16384 },
    target: { type: 'string', enum: [...Object.values(ConnectTarget), null], nullable: true },
    sessionId: { ...idValue, nullable: true },
  },
  required: ['prompt'],
  additionalProperties: false,
} as JSONSchemaType<ConnectCreateBody>

export const ConnectConfirmBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 128, nullable: true },
    description: { type: 'string', maxLength: 16384, nullable: true },
    specification: { type: 'string', maxLength: 262144, nullable: true },
    vision: { type: 'string', maxLength: 16384, nullable: true },
    designSystem: { type: 'string', maxLength: 262144, nullable: true },
    target: { type: 'string', enum: [...Object.values(ConnectTarget), null], nullable: true },
  },
  required: [],
  additionalProperties: false,
} as JSONSchemaType<ConnectConfirmBody>

export const ConnectModifyBodySchema = {
  type: 'object',
  properties: { prompt: { type: 'string', minLength: 1, maxLength: 16384 } },
  required: ['prompt'],
  additionalProperties: false,
} as JSONSchemaType<ConnectModifyBody>

export const ConnectRenameBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 128 },
    description: { type: 'string', minLength: 1, maxLength: 2048, nullable: true },
  },
  required: ['name'],
  additionalProperties: false,
} as JSONSchemaType<ConnectRenameBody>

const kitKey = { type: 'string', minLength: 1, maxLength: 128 } as const
const kitText = { type: 'string', maxLength: 4096 } as const
const kitStrings = { type: 'array', items: kitKey, maxItems: 256 } as const

/** A planning kit as `project.kit.describe` lists it. Closed, like every view this package pins. */
export const PlanningKitViewSchema = {
  type: 'object',
  properties: {
    id: kitKey,
    kind: kitKey,
    title: kitText,
    purpose: kitText,
    container: {
      type: 'object',
      properties: { key: kitKey, label: kitText },
      required: ['key', 'label'],
      additionalProperties: false,
    },
    types: {
      type: 'array',
      maxItems: 256,
      items: {
        type: 'object',
        properties: { key: kitKey, label: kitText, flow: kitKey },
        required: ['key', 'label', 'flow'],
        additionalProperties: false,
      },
    },
    flows: {
      type: 'array',
      maxItems: 256,
      items: {
        type: 'object',
        properties: {
          key: kitKey,
          label: kitText,
          statuses: {
            type: 'array',
            maxItems: 256,
            items: {
              type: 'object',
              properties: { key: kitKey, label: kitText, intrinsic: kitKey },
              required: ['key', 'label', 'intrinsic'],
              additionalProperties: false,
            },
          },
        },
        required: ['key', 'label', 'statuses'],
        additionalProperties: false,
      },
    },
  },
  required: ['id', 'kind', 'title', 'purpose', 'container', 'types', 'flows'],
  additionalProperties: false,
} as unknown as JSONSchemaType<PlanningKitView>

export const ConnectKitDescribeSchema = {
  type: 'object',
  properties: { kits: { type: 'array', items: PlanningKitViewSchema, maxItems: 64 } },
  required: ['kits'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectKitDescribe>

/** `types` keeps only these card-type keys of the kit; omitted (or `null`) keeps every type. */
export const ConnectKitApplyBodySchema = {
  type: 'object',
  properties: {
    kit: kitKey,
    types: { ...kitStrings, nullable: true },
  },
  required: ['kit'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectKitApplyBody>

export const ConnectKitApplyResultSchema = {
  type: 'object',
  properties: {
    applied: kitStrings,
    skipped: kitStrings,
    warnings: { type: 'array', items: kitText, maxItems: 256 },
  },
  required: ['applied', 'skipped', 'warnings'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectKitApplyResult>

export const ConnectAttachBodySchema = {
  type: 'object',
  properties: {
    projectId: { ...idValue, nullable: true },
    slug: { type: 'string', maxLength: 64, nullable: true },
    projectDir: { type: 'string', maxLength: 4096, nullable: true },
  },
  required: [],
  additionalProperties: false,
} as JSONSchemaType<ConnectAttachBody>

export const ConnectPipelineParamsSchema = {
  type: 'object',
  properties: { id: idValue, runId: { type: 'string', minLength: 1, maxLength: 256 } },
  required: ['id', 'runId'],
  additionalProperties: false,
} as JSONSchemaType<ConnectPipelineParams>

export const ConnectPipelineResumeBodySchema = {
  type: 'object',
  properties: {
    from: { type: 'string', maxLength: 128, nullable: true },
    force: { type: 'boolean', nullable: true },
    // Keyed by inquiry id, so the key space is open by construction and cannot be enumerated.
    // The values are validated where they are read, against InquiryAnswerSchema.
    answers: { type: 'object', additionalProperties: true, required: [], nullable: true },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectPipelineResumeBody>

/**
 * One answer to one question.
 *
 * `value` is a union — one choice or several — expressed as `oneOf`, never as a `nullable` with no
 * `type`: Ajv refuses that, and this schema is compiled at route registration, so the refusal
 * takes the whole API down at boot rather than failing the one call that carried the value.
 */
export const InquiryAnswerSchema = {
  type: 'object',
  properties: {
    inquiryId: idValue,
    value: {
      oneOf: [
        { type: 'string', maxLength: CONNECT_INQUIRY_MAX_TEXT },
        {
          type: 'array',
          items: { type: 'string', maxLength: CONNECT_INQUIRY_MAX_TEXT },
          maxItems: 32,
        },
      ],
    },
    text: { type: 'string', maxLength: CONNECT_INQUIRY_MAX_TEXT, nullable: true },
    declined: { type: 'boolean', nullable: true },
  },
  required: ['inquiryId'],
  additionalProperties: false,
} as unknown as JSONSchemaType<InquiryAnswerPayload>

/** The two ids an answer is addressed by: the project it belongs to and the question it answers. */
export const ConnectInquiryParamsSchema = {
  type: 'object',
  properties: { id: idValue, inquiryId: idValue },
  required: ['id', 'inquiryId'],
  additionalProperties: false,
} as JSONSchemaType<{ id: string, inquiryId: string }>

export const ConnectConvertCreateBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 128, nullable: true },
    about: { type: 'string', maxLength: 16384, nullable: true },
    target: { type: 'string', enum: [...Object.values(ConnectTarget), null], nullable: true },
    origin: {
      type: 'object',
      nullable: true,
      properties: {
        kind: { type: 'string', enum: Object.values(OriginKind) },
        repoUrl: { type: 'string', maxLength: 2048, nullable: true },
        branch: { type: 'string', maxLength: 256, nullable: true },
      },
      required: ['kind'],
      additionalProperties: false,
    },
    sessionId: { ...idValue, nullable: true },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectConvertCreateBody>

export const ConnectConvertStartBodySchema = {
  type: 'object',
  properties: {
    confirm: { type: 'boolean', nullable: true },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectConvertStartBody>

export const ConnectConvertProceedBodySchema = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: Object.values(ConversionDecision) },
    note: { type: 'string', maxLength: 4096, nullable: true },
    confirm: { type: 'boolean', nullable: true },
    update: {
      type: 'object',
      nullable: true,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 128, nullable: true },
        description: { type: 'string', maxLength: 16384, nullable: true },
        specification: { type: 'string', maxLength: 262144, nullable: true },
        vision: { type: 'string', maxLength: 16384, nullable: true },
        designSystem: { type: 'string', maxLength: 262144, nullable: true },
      },
      required: [],
      additionalProperties: false,
    },
  },
  required: ['decision'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectConvertProceedBody>

export const ConnectLlmBodySchema = {
  type: 'object',
  properties: { llmMode: { type: 'string', enum: Object.values(ConnectLlm) } },
  required: ['llmMode'],
  additionalProperties: false,
} as JSONSchemaType<ConnectLlmBody>

export const ConnectProjectLlmBodySchema = {
  type: 'object',
  properties: { llmMode: { type: 'string', enum: [...Object.values(ConnectLlm), null], nullable: true } },
  required: ['llmMode'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectProjectLlmBody>

/**
 * The branding patch a connector saves.
 *
 * STRUCTURAL only — lengths and types. What makes a value acceptable (a non-empty copyright and
 * organization, a legal link that is `https://` or a same-origin path, a real Google tag id) is the
 * platform's rule, applied by the handler to the MERGED record with the same checks the web form
 * uses; a pattern repeated here would be a second copy of those rules free to drift from the first.
 * No `pattern`, and no `enum` on the tag: a connector and the platform deploy apart, and a tag kind
 * Google adds later must be refused by the rule that knows about it, not by a stale wire schema.
 */
export const ConnectProjectBrandingSaveSchema = {
  type: 'object',
  properties: {
    copyright: {
      type: 'string', minLength: 1, maxLength: CONNECT_BRANDING_COPYRIGHT_MAX, nullable: true,
    },
    organizationName: {
      type: 'string', minLength: 1, maxLength: CONNECT_BRANDING_ORGANIZATION_MAX, nullable: true,
    },
    termsUrl: { type: 'string', maxLength: CONNECT_BRANDING_URL_MAX, nullable: true },
    privacyUrl: { type: 'string', maxLength: CONNECT_BRANDING_URL_MAX, nullable: true },
    googleTag: { type: 'string', maxLength: CONNECT_BRANDING_GOOGLE_TAG_MAX, nullable: true },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectProjectBrandingSave>

/**
 * `?scope=` of a configuration or branding route: the preview's set (absent) or production's own.
 * Never `local` — a local target's configuration is its preview set, written into its `.env`.
 */
export const ConnectScopeQuerySchema = {
  type: 'object',
  properties: {
    scope: { type: 'string', enum: [WorkloadKind.Ephemeral, WorkloadKind.Production, null], nullable: true },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectScopeQuery>

export const ConnectBrandingCreditBodySchema = {
  type: 'object',
  properties: { hideCredit: { type: 'boolean' } },
  required: ['hideCredit'],
  additionalProperties: false,
} as JSONSchemaType<ConnectBrandingCreditBody>

/** One variable a save sets: an environment variable name and its value (`''` unsets it). */
const configValue = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: CONNECT_CONFIG_NAME_MAX, pattern: CONNECT_CONFIG_NAME_PATTERN },
    value: { type: 'string', maxLength: CONNECT_CONFIG_VALUE_MAX },
  },
  required: ['name', 'value'],
  additionalProperties: false,
} as const

export const ConnectConfigSaveBodySchema = {
  type: 'object',
  properties: {
    backend: { type: 'array', items: configValue, maxItems: CONNECT_CONFIG_SAVE_MAX, nullable: true },
    frontend: { type: 'array', items: configValue, maxItems: CONNECT_CONFIG_SAVE_MAX, nullable: true },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectConfigSaveBody>

/** The organization's defaults as a patch — the manager's own bounds, neither field empty. */
export const ConnectOrganizationBrandingSaveSchema = {
  type: 'object',
  properties: {
    organizationName: {
      type: 'string', minLength: 1, maxLength: CONNECT_BRANDING_ORGANIZATION_MAX, nullable: true,
    },
    copyright: { type: 'string', minLength: 1, maxLength: CONNECT_BRANDING_COPYRIGHT_MAX, nullable: true },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectOrganizationBrandingSave>

/** The token a revoke names: one id, bounded like every token route's. */
export const ConnectAccessTokenParamsSchema = {
  type: 'object',
  properties: { id: { type: 'string', minLength: 1, maxLength: CONNECT_TOKEN_ID_MAX } },
  required: ['id'],
  additionalProperties: false,
} as JSONSchemaType<ConnectAccessTokenParams>

/**
 * A withdrawal: the consent keys to write `granted: false` for. There is no `granted` field to
 * send — the body cannot express a grant at all. Which keys exist is the platform's catalogue.
 */
export const ConnectPrivacyWithdrawBodySchema = {
  type: 'object',
  properties: {
    keys: {
      type: 'array', minItems: 1, maxItems: CONNECT_PRIVACY_KEYS_MAX, uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: CONNECT_PRIVACY_KEY_MAX },
    },
  },
  required: ['keys'],
  additionalProperties: false,
} as JSONSchemaType<ConnectPrivacyWithdrawBody>

/** A stashed prompt's reference — exactly the guest pickup's shape, so a crafted value is refused. */
export const ConnectIntentPickupBodySchema = {
  type: 'object',
  properties: {
    ref: { type: 'string', minLength: INTENT_REF_LENGTH, maxLength: INTENT_REF_LENGTH, pattern: INTENT_REF_PATTERN },
  },
  required: ['ref'],
  additionalProperties: false,
} as JSONSchemaType<ConnectIntentPickupBody>

export const ModelTaskResultSchema = {
  type: 'object',
  properties: {
    taskId: idValue,
    kind: { type: 'string', enum: Object.values(ModelTaskResultKind) },
    text: { type: 'string', maxLength: 1_048_576, nullable: true },
    // The parent agent's answer in `json` mode: any JSON the task's own output schema described.
    // The empty schema, never `nullable` — see ConnectOpResultSchema.value.
    json: {},
    toolCalls: {
      type: 'array',
      nullable: true,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', maxLength: 128, nullable: true },
          name: { type: 'string', minLength: 1, maxLength: 128 },
          args: { type: 'object', additionalProperties: true, required: [] },
        },
        required: ['name', 'args'],
        additionalProperties: false,
      },
    },
    error: { type: 'string', maxLength: 8192, nullable: true },
    usage: {
      type: 'object',
      nullable: true,
      properties: {
        inputTokens: { type: 'integer', minimum: 0, nullable: true },
        outputTokens: { type: 'integer', minimum: 0, nullable: true },
      },
      required: [],
      additionalProperties: false,
    },
    model: { type: 'string', maxLength: 128, nullable: true },
  },
  required: ['taskId', 'kind'],
  additionalProperties: false,
} as any

/** A file of a cloud target, by its path relative to the project root. */
const filePath = { type: 'string', minLength: 1, maxLength: CONNECT_FILE_PATH_MAX } as const

export const ConnectFileQuerySchema = {
  type: 'object',
  properties: { path: filePath },
  required: ['path'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectFileQuery>

/** The whole content of one file; an empty string is an empty file. */
export const ConnectFileSaveBodySchema = {
  type: 'object',
  properties: { path: filePath, content: { type: 'string' } },
  required: ['path', 'content'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectFileSaveBody>

export const ConnectFileMetaQuerySchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: Object.values(MetadataListKind) },
    category: { type: 'string', enum: [...Object.values(SpecCategory), null], nullable: true },
  },
  required: ['kind'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectFileMetaQuery>

/** A GitHub owner or repository name — the web's own bound. */
const githubName = { type: 'string', minLength: 1, maxLength: CONNECT_GITHUB_NAME_MAX } as const
/**
 * A picker page. A query arrives as a string and the API server coerces it to the declared type, so
 * this says what it is; bounded on both ends, because the number reaches GitHub.
 */
const githubPage = { type: 'number', minimum: 1, maximum: CONNECT_GITHUB_PAGE_MAX, nullable: true } as const

export const ConnectGitCommitBodySchema = {
  type: 'object',
  properties: { message: { type: 'string', minLength: 1, maxLength: CONNECT_GIT_MESSAGE_MAX } },
  required: ['message'],
  additionalProperties: false,
} as JSONSchemaType<ConnectGitCommitBody>

export const ConnectGitRevertBodySchema = {
  type: 'object',
  properties: { hash: { type: 'string', pattern: CONNECT_GIT_HASH_PATTERN } },
  required: ['hash'],
  additionalProperties: false,
} as JSONSchemaType<ConnectGitRevertBody>

export const ConnectGithubPublishBodySchema = {
  type: 'object',
  properties: {
    repoName: { ...githubName, nullable: true },
    private: { type: 'boolean', nullable: true },
    existing: {
      type: 'object',
      properties: { owner: githubName, repo: githubName },
      required: ['owner', 'repo'],
      additionalProperties: false,
      nullable: true,
    },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectGithubPublishBody>

export const ConnectGithubRepoQuerySchema = {
  type: 'object',
  properties: {
    page: githubPage,
    search: { type: 'string', maxLength: CONNECT_GITHUB_SEARCH_MAX, nullable: true },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectGithubRepoQuery>

export const ConnectGithubBranchQuerySchema = {
  type: 'object',
  properties: { owner: githubName, repo: githubName, page: githubPage },
  required: ['owner', 'repo'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectGithubBranchQuery>

export const ConnectGithubLinkBodySchema = {
  type: 'object',
  properties: {
    owner: githubName,
    repo: githubName,
    branch: { type: 'string', minLength: 1, maxLength: CONNECT_GITHUB_BRANCH_MAX, nullable: true },
  },
  required: ['owner', 'repo'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectGithubLinkBody>

/** A custom domain to attach: a DNS host name, the web's own rule. */
export const ConnectProductionDomainBodySchema = {
  type: 'object',
  properties: {
    domain: { type: 'string', minLength: CONNECT_DOMAIN_MIN, maxLength: CONNECT_DOMAIN_MAX, pattern: CONNECT_DOMAIN_PATTERN },
  },
  required: ['domain'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectProductionDomainBody>

/** The whole list of standalone redirect addresses — bounded; an empty list clears it. */
export const ConnectProductionRedirectsBodySchema = {
  type: 'object',
  properties: {
    redirects: {
      type: 'array',
      maxItems: CONNECT_REDIRECTS_MAX,
      items: { type: 'string', maxLength: CONNECT_REDIRECT_URI_MAX },
    },
  },
  required: ['redirects'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectProductionRedirectsBody>

/** A feed cursor — the `after` a previous read answered. */
const feedCursor = {
  type: 'string', minLength: 3, maxLength: CONNECT_FEED_CURSOR_MAX, pattern: CONNECT_FEED_CURSOR_PATTERN, nullable: true,
} as const

/** The properties every feed read's query shares. */
const feedQueryProperties = {
  after: feedCursor,
  limit: { type: 'integer', minimum: 1, maximum: CONNECT_FEED_LIMIT_MAX, nullable: true },
  wait: { type: 'integer', minimum: 0, maximum: CONNECT_FEED_WAIT_MAX_SEC, nullable: true },
} as const

/** A feed read's query: after which entry, how many, how long to hold. */
export const ConnectFeedQuerySchema = {
  type: 'object',
  properties: feedQueryProperties,
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectFeedQuery>

/** The project activity read's query: a feed query and its detail (`null` is the default, progress). */
export const ConnectActivityQuerySchema = {
  type: 'object',
  properties: {
    ...feedQueryProperties,
    detail: { type: 'string', enum: [...Object.values(ConnectFeedDetail), null], nullable: true },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConnectActivityQuery>
