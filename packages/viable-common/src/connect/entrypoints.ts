import type { BlueprintCatalogue } from '../blueprint/catalogue/types.js'
import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { route, RouteMethod } from '@owlmeans/route'
import { connect, ConnectPaidGate } from './consts.js'
import {
  ConnectAccessTokenParamsSchema, ConnectIntentPickupBodySchema, ConnectLlmBodySchema, ConnectPrivacyWithdrawBodySchema,
  ConnectProjectLlmBodySchema, ConnectAttachBodySchema, ConnectBrandingCreditBodySchema, ConnectCallCollectParamsSchema, ConnectConfigSaveBodySchema, ConnectCallCollectQuerySchema, ConnectConfirmBodySchema, ConnectConvertCreateBodySchema,
  ConnectConvertProceedBodySchema, ConnectConvertStartBodySchema, ConnectCreateBodySchema,
  ConnectFileMetaQuerySchema, ConnectFileQuerySchema, ConnectFileSaveBodySchema,
  ConnectInquiryParamsSchema, ConnectKitApplyBodySchema,
  ConnectModifyBodySchema, ConnectRenameBodySchema, ConnectOpParamsSchema, ConnectOpResultSchema,
  ConnectPipelineParamsSchema, ConnectPipelineResumeBodySchema, ConnectProjectBrandingSaveSchema,
  ConnectProjectIdSchema, ConnectSessionOpenSchema, ConnectSessionParamsSchema, ConnectPullQuerySchema,
  ConnectOrganizationBrandingSaveSchema, ConnectScopeQuerySchema, ConnectStoryParamsSchema, InquiryAnswerSchema,
  ConnectGitCommitBodySchema, ConnectGitRevertBodySchema, ConnectGithubBranchQuerySchema, ConnectGithubLinkBodySchema,
  ConnectGithubPublishBodySchema, ConnectGithubRepoQuerySchema, ConnectProductionDomainBodySchema,
  ConnectProductionRedirectsBodySchema, ConnectIamGroupParamsSchema, ConnectIamMemberParamsSchema,
  ConnectIamOrganizationParamsSchema, ConnectIamUserParamsSchema, ConnectActivityQuerySchema, ConnectFeedQuerySchema,
} from './schemas.js'
import type {
  ConnectAccessTokenList, ConnectAccessTokenParams, ConnectAccessTokenRevoked, ConnectBrandingBackfill, ConnectIntentPickup,
  ConnectIntentPickupBody, ConnectOrganizationBranding, ConnectOrganizationBrandingSave, ConnectPrivacyChoices,
  ConnectPrivacyWithdrawBody,
} from './account/types.js'
import type { ConnectBrandingCreditBody, ConnectProjectBranding, ConnectProjectBrandingSave } from './branding/types.js'
import type { ConnectCallCollectParams, ConnectCallCollectQuery, ConnectCallResult } from './call/types.js'
import type { ConnectConfigSaveBody, ConnectProjectConfig, ConnectScopeQuery } from './config/types.js'
import type {
  ConnectConvertCreateBody, ConnectConvertProceedBody, ConnectConvertStartBody, ConversionStatusView, ConvertCheck
} from './conversion/types.js'
import type { ConnectEntrypointOptions, ConnectGateRef } from './entrypoints/types.js'
import type {
  ConnectFileContent, ConnectFileMetaQuery, ConnectFileQuery, ConnectFileSaveBody, ConnectFileWritten,
} from './files/types.js'
import type {
  ConnectGitCommit, ConnectGitCommitBody, ConnectGitCommitResult, ConnectGitRevertBody, ConnectGitRevertResult,
  ConnectGitState, ConnectGitStatus, ConnectGitSyncResult, ConnectGithubAuthorize, ConnectGithubBranchList,
  ConnectGithubBranchQuery, ConnectGithubConnection, ConnectGithubDisconnected, ConnectGithubLinkBody, ConnectGithubLinked,
  ConnectGithubPublishBody, ConnectGithubRepoList, ConnectGithubRepoQuery,
} from './git/types.js'
import type { ConnectKitApplyBody, ConnectKitApplyResult, ConnectKitDescribe } from './kit/types.js'
import type { ConnectActivityQuery, ConnectFeedPage, ConnectFeedQuery, ConnectFileChanges } from './feed/types.js'
import type { ConnectInquiryAnswerBody, ConnectOpResult } from './ops/types.js'
import type { ConnectPipelineParams, ConnectPipelineResumeBody, ConnectPipelineState } from './pipeline/types.js'
import type {
  ConnectAgentLock, ConnectAttachBody, ConnectConfirmBody, ConnectCreateBody, ConnectModifyBody, ConnectRenameBody,
  ConnectProjectStatus, ConnectProjectSummary, ConnectStoryStatus
} from './project/types.js'
import type {
  ConnectProductionAuth, ConnectProductionDomain, ConnectProductionDomainBody, ConnectProductionRedirects,
  ConnectProductionRedirectsBody, ConnectProductionStatus,
} from './production/types.js'
import type { ConnectPullQuery, ConnectSessionOpen, ConnectSessionParams } from './session/types.js'
import type { ConnectLlmBody, ConnectProfileSettingsView, ConnectProjectLlmBody, ConnectProjectSettings } from './settings/types.js'
import type { ConnectSlotView } from './slot/types.js'
import type {
  ConnectIamGroupParams, ConnectIamMemberParams, ConnectIamOrganizationParams, ConnectIamUserParams,
} from './iam/types.js'
import {
  IamAssignGrantSchema, IamDefinitionUpdateSchema, IamGrantsQuerySchema, IamGroupCreateSchema, IamGroupEditSchema,
  IamGroupMembersChangeSchema, IamOrganizationEditSchema, IamProjectMemberInviteSchema, IamProjectMemberUpdateSchema,
  IamProjectUserInviteSchema, IamProjectUserUpdateSchema, IamRevokeGrantSchema, IamScopedSchema,
} from '../iam-console/schemas.js'
import type {
  IamAssignGrant, IamDefinitionUpdate, IamGrant, IamGrantsQuery, IamGrantsResponse, IamGroup, IamGroupCreate,
  IamGroupEdit, IamGroupMembersChange, IamGroupsResponse, IamMember, IamMembersResponse, IamOrganization,
  IamOrganizationEdit, IamOrganizationsResponse, IamPermissionDefinition, IamPermissionsResponse,
  IamProjectMemberInvite, IamProjectMemberUpdate, IamProjectUserInvite, IamProjectUserUpdate, IamRevokeGrant,
  IamScoped, IamUser, IamUsersResponse,
} from '../iam-console/types.js'

/**
 * Declare the connector's HTTP surface — exactly the routes a connector calls: the session (long
 * poll, no socket), the operation relay, projects (their lifecycle and agent lock included), story
 * status, generated files (read, written, deleted, metadata listed), the preview workload's controls,
 * the organization's workloads, the project's git repository and GitHub connection, its production
 * workload (published, restarted, stopped, its custom domain and standalone sign-in), its generated
 * app's sign-in (end users, permission definitions, grants, organizations and groups), conversion,
 * inquiry answers, pipeline state, the collection of a
 * delegated write answered early, the three feeds a connector reads instead of the browser's
 * sockets (a project's activity, the organization's notices, the preview's file changes — cursor
 * polling, held at most `CONNECT_FEED_WAIT_MAX_SEC`), and the organization's own records under the
 * account base — its branding defaults, the person's inference preference, access tokens (listed and
 * revoked, never minted), marketing consents (read and withdrawn, never granted), the intent pickup
 * and the read-only list of every end user of the organization's apps.
 *
 * One immutable tree, mounted directly by the platform's entrypoint tree. Handlers are bound to these protocols
 * server-side and onto client entrypoints in the SDK — the same declarations both times, which is
 * what makes a path or a schema impossible to get wrong on one side only.
 */
export const connectProtocols = (opts: ConnectEntrypointOptions) => {
  const prefix = opts.path ?? '/connect'
  const ownership = opts.gate != null
    ? { guards: opts.guard, gate: opts.gate }
    : { guards: opts.guard }
  const accountOwnership = opts.accountGate != null
    ? { guards: opts.guard, gate: opts.accountGate }
    : { guards: opts.guard }
  // The payment gate of a route that spends `kind`, as the deployment names it — or none.
  const paidGate = (kind: ConnectPaidGate): { gate: ConnectGateRef } | undefined => {
    const gate = opts.paid?.[kind] ?? (kind === ConnectPaidGate.LocalLlm ? opts.localLlm : undefined)

    return gate != null ? { gate } : undefined
  }
  const paid = paidGate(ConnectPaidGate.LocalLlm)

  const base = openProtocol(route(connect.base, prefix), ownership)
  // The IAM routes' shared request parts: the project, then the subject, organization or group.
  const organization = '/project/:id/iam/organizations/:entitySlug'
  const group = `${organization}/groups/:group`
  const projectParams = { params: typed<{ id: string }>(ConnectProjectIdSchema) }
  const userParams = { params: typed<ConnectIamUserParams>(ConnectIamUserParamsSchema) }
  const organizationParams = { params: typed<ConnectIamOrganizationParams>(ConnectIamOrganizationParamsSchema) }
  const memberParams = { params: typed<ConnectIamMemberParams>(ConnectIamMemberParamsSchema) }
  const groupParams = { params: typed<ConnectIamGroupParams>(ConnectIamGroupParamsSchema) }
  const scopeQuery = { query: typed<ConnectScopeQuery>(ConnectScopeQuerySchema) }
  const scopedBody = { body: typed<IamScoped>(IamScopedSchema) }
  // A root of its own: a child of `base` would resolve the project gate and the account gate under
  // one gate service, and `getGates()` keeps one gate per service.
  const accountBase = openProtocol(route(connect.account.base, `${prefix}/account`), accountOwnership)

  return {
    base,

    // --- the organization's own records ----------------------------------------------------
    account: {
    base: accountBase,
    blueprints: protocol(
      route(connect.account.blueprints, '/blueprints', { parent: accountBase, method: RouteMethod.GET }),
      contract(typed<BlueprintCatalogue>()),
    ),
    // The organization's branding defaults: read, a patch saved (its name and copyright judged by
    // the content gate), and copied into the projects whose rows are still blank.
    branding: {
      get: protocol(
        route(connect.account.branding.get, '/branding', { parent: accountBase, method: RouteMethod.GET }),
        contract(typed<ConnectOrganizationBranding>()),
      ),
      save: protocol(
        route(connect.account.branding.save, '/branding', { parent: accountBase, method: RouteMethod.POST }),
        contract.request({
          body: typed<ConnectOrganizationBrandingSave>(ConnectOrganizationBrandingSaveSchema),
        }, typed<ConnectOrganizationBranding>()),
      ),
      backfill: protocol(
        route(connect.account.branding.backfill, '/branding/backfill', { parent: accountBase, method: RouteMethod.POST }),
        contract(typed<ConnectBrandingBackfill>()),
      ),
    },
    // The person's inference preference: read free, set under the local-LLM payment gate — its
    // browser twin's — since the one value a write can set that `cloud` is not is the paid one.
    llm: {
      get: protocol(
        route(connect.account.llm.get, '/llm', { parent: accountBase, method: RouteMethod.GET }),
        contract(typed<ConnectProfileSettingsView>()),
      ),
      set: protocol(
        route(connect.account.llm.set, '/llm', { parent: accountBase, method: RouteMethod.POST }),
        contract.request({ body: typed<ConnectLlmBody>(ConnectLlmBodySchema) }, typed<ConnectProfileSettingsView>()),
        paid,
      ),
    },
    // The person's own access tokens: listed and revoked — never minted here. Not under `/tokens`:
    // that mount is the browser's token surface, whose create a connector must never reach.
    tokens: {
      list: protocol(
        route(connect.account.tokens.list, '/access-tokens', { parent: accountBase, method: RouteMethod.GET }),
        contract(typed<ConnectAccessTokenList>()),
      ),
      revoke: protocol(
        route(connect.account.tokens.revoke, '/access-tokens/:id/revoke', { parent: accountBase, method: RouteMethod.POST }),
        contract.request({
          params: typed<ConnectAccessTokenParams>(ConnectAccessTokenParamsSchema),
        }, typed<ConnectAccessTokenRevoked>()),
      ),
    },
    // The person's marketing consents: read, and withdrawn — the body can say nothing but "no".
    privacy: {
      status: protocol(
        route(connect.account.privacy.status, '/privacy', { parent: accountBase, method: RouteMethod.GET }),
        contract(typed<ConnectPrivacyChoices>()),
      ),
      withdraw: protocol(
        route(connect.account.privacy.withdraw, '/privacy/withdraw', { parent: accountBase, method: RouteMethod.POST }),
        contract.request({
          body: typed<ConnectPrivacyWithdrawBody>(ConnectPrivacyWithdrawBodySchema),
        }, typed<ConnectPrivacyChoices>()),
      ),
    },
    // A stashed prompt collected once by its reference — the guest pickup's record and throttle,
    // for a caller who is already signed in.
    intent: {
      pickup: protocol(
        route(connect.account.intent.pickup, '/intent/pickup', { parent: accountBase, method: RouteMethod.POST }),
        contract.request({
          body: typed<ConnectIntentPickupBody>(ConnectIntentPickupBodySchema),
        }, typed<ConnectIntentPickup>()),
      ),
    },
    // Every end user of every app the organization owns — read-only; a person is managed per project.
    iam: {
      users: protocol(
        route(connect.account.iam.users, '/iam/users', { parent: accountBase, method: RouteMethod.GET }),
        contract(typed<IamUsersResponse>()),
      ),
    },
    // The organization's notices by cursor — the browser's notifications socket, polled.
    notifications: protocol(
      route(connect.account.notifications, '/notifications', { parent: accountBase, method: RouteMethod.GET }),
      contract.request({ query: typed<ConnectFeedQuery>(ConnectFeedQuerySchema) }, typed<ConnectFeedPage>()),
    ),
    },

    // --- session ---------------------------------------------------------------------------
    session: {
    open: protocol(
      route(connect.session.open, '/session', { parent: base, method: RouteMethod.POST }),
      contract.request({ body: typed<ConnectSessionOpen>(ConnectSessionOpenSchema) }, typed())
    ),
    openDelegated: protocol(
      route(connect.session.openDelegated, '/session/delegated', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ body: typed<ConnectSessionOpen>(ConnectSessionOpenSchema) }, typed()), paid
    ),
    close: protocol(
      route(connect.session.close, '/session/:sessionId/close', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<ConnectSessionParams>(ConnectSessionParamsSchema) }, typed())
    ),
    },

    // --- operations ------------------------------------------------------------------------
    op: {
    pull: protocol(
      route(connect.op.pull, '/session/:sessionId/ops', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<ConnectSessionParams>(ConnectSessionParamsSchema), query: typed<ConnectPullQuery>(ConnectPullQuerySchema) }, typed())
    ),
    submit: protocol(
      route(connect.op.submit, '/session/:sessionId/ops/:opId', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ sessionId: string, opId: string }>(ConnectOpParamsSchema), body: typed<ConnectOpResult>(ConnectOpResultSchema) }, typed())
    ),

    },

    // --- project ---------------------------------------------------------------------------
    project: {
    create: protocol(
      route(connect.project.create, '/project', { parent: base, method: RouteMethod.POST }),
      contract.request({ body: typed<ConnectCreateBody>(ConnectCreateBodySchema) }, typed<ConnectProjectStatus>())
    ),
    list: protocol(
      route(connect.project.list, '/project', { parent: base, method: RouteMethod.GET }),
      contract(typed()),
    ),
    attach: protocol(
      route(connect.project.attach, '/project/attach', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ body: typed<ConnectAttachBody>(ConnectAttachBodySchema) }, typed())
    ),
    confirm: protocol(
      route(connect.project.confirm, '/project/:id/confirm', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), body: typed<ConnectConfirmBody>(ConnectConfirmBodySchema) }, typed<ConnectProjectStatus>())
    ),
    status: protocol(
      route(connect.project.status, '/project/:id/status', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectProjectStatus>())
    ),
    reinit: protocol(
      route(connect.project.reinit, '/project/:id/reinit', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectProjectStatus>())
    ),
    modify: protocol(
      route(connect.project.modify, '/project/:id/modify', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), body: typed<ConnectModifyBody>(ConnectModifyBodySchema) }, typed<ConnectProjectStatus>())
    ),
    rename: protocol(
      route(connect.project.rename, '/project/:id/rename', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), body: typed<ConnectRenameBody>(ConnectRenameBodySchema) }, typed<ConnectProjectStatus>())
    ),
    // Irreversible: the project, its workloads, stories, documents and connector sessions go.
    destroy: protocol(
      route(connect.project.destroy, '/project/:id', {
        parent: base, method: RouteMethod.DELETE
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectProjectSummary>())
    ),
    // The web's force-unlock: under the owned base, no payment gate — nothing is spent.
    unlock: protocol(
      route(connect.project.unlock, '/project/:id/unlock', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectAgentLock>())
    ),
    // The project's agent activity by cursor — the browser's project socket, polled; the ownership gate alone.
    activity: protocol(
      route(connect.project.activity, '/project/:id/activity', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        query: typed<ConnectActivityQuery>(ConnectActivityQuerySchema),
      }, typed<ConnectFeedPage>())
    ),
    // The project's inference override: read free, set under the local-LLM payment gate — its
    // browser twin's; `null` unsets the override.
    llm: {
      get: protocol(
        route(connect.project.llm.get, '/project/:id/llm', { parent: base, method: RouteMethod.GET }),
        contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectProjectSettings>()),
      ),
      set: protocol(
        route(connect.project.llm.set, '/project/:id/llm', { parent: base, method: RouteMethod.POST }),
        contract.request({
          params: typed<{ id: string }>(ConnectProjectIdSchema),
          body: typed<ConnectProjectLlmBody>(ConnectProjectLlmBodySchema),
        }, typed<ConnectProjectSettings>()),
        paid,
      ),
    },
    // Planning kits: one path, read and applied under the owned base like every project route.
    kit: {
      describe: protocol(
        route(connect.project.kit.describe, '/project/:id/kits', {
          parent: base, method: RouteMethod.GET,
        }),
        contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectKitDescribe>()),
      ),
      apply: protocol(
        route(connect.project.kit.apply, '/project/:id/kits', {
          parent: base, method: RouteMethod.POST,
        }),
        contract.request({
          params: typed<{ id: string }>(ConnectProjectIdSchema),
          body: typed<ConnectKitApplyBody>(ConnectKitApplyBodySchema),
        }, typed<ConnectKitApplyResult>()),
      ),
    },
    // Under `base` like every sibling — the guard and the ownership gate. The text settings are
    // free; the credit switch is the one route here that carries a payment gate (white label), its
    // browser twin's. `?scope=production` addresses the production workload's own rows.
    branding: {
      get: protocol(
        route(connect.project.branding.get, '/project/:id/branding', {
          parent: base, method: RouteMethod.GET,
        }),
        contract.request({
          params: typed<{ id: string }>(ConnectProjectIdSchema),
          query: typed<ConnectScopeQuery>(ConnectScopeQuerySchema),
        }, typed<ConnectProjectBranding>()),
      ),
      save: protocol(
        route(connect.project.branding.save, '/project/:id/branding', {
          parent: base, method: RouteMethod.POST,
        }),
        contract.request({
          params: typed<{ id: string }>(ConnectProjectIdSchema),
          query: typed<ConnectScopeQuery>(ConnectScopeQuerySchema),
          body: typed<ConnectProjectBrandingSave>(ConnectProjectBrandingSaveSchema),
        }, typed<ConnectProjectBranding>()),
      ),
      credit: protocol(
        route(connect.project.branding.credit, '/project/:id/branding/credit', {
          parent: base, method: RouteMethod.POST,
        }),
        contract.request({
          params: typed<{ id: string }>(ConnectProjectIdSchema),
          query: typed<ConnectScopeQuery>(ConnectScopeQuerySchema),
          body: typed<ConnectBrandingCreditBody>(ConnectBrandingCreditBodySchema),
        }, typed<ConnectProjectBranding>()),
        paidGate(ConnectPaidGate.Whitelabel),
      ),
      copyDefaults: protocol(
        route(connect.project.branding.copyDefaults, '/project/:id/branding/copy-defaults', {
          parent: base, method: RouteMethod.POST,
        }),
        contract.request({
          params: typed<{ id: string }>(ConnectProjectIdSchema),
          query: typed<ConnectScopeQuery>(ConnectScopeQuerySchema),
        }, typed<ConnectProjectBranding>()),
      ),
    },
    },

    // --- configuration -----------------------------------------------------------------------
    // The variables the generated application reads — a backend value is never answered. Nothing is
    // spent, so the owned base alone; a save of the preview's set reconfigures (and rebuilds) it.
    config: {
    get: protocol(
      route(connect.config.get, '/project/:id/config', { parent: base, method: RouteMethod.GET }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        query: typed<ConnectScopeQuery>(ConnectScopeQuerySchema),
      }, typed<ConnectProjectConfig>()),
    ),
    save: protocol(
      route(connect.config.save, '/project/:id/config', { parent: base, method: RouteMethod.POST }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        query: typed<ConnectScopeQuery>(ConnectScopeQuerySchema),
        body: typed<ConnectConfigSaveBody>(ConnectConfigSaveBodySchema),
      }, typed<ConnectProjectConfig>()),
    ),
    // The platform's own agent reads the generated sources again for the variables they declare.
    recollect: protocol(
      route(connect.config.recollect, '/project/:id/config/recollect', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectProjectConfig>()),
    ),
    },

    story: {
    status: protocol(
      route(connect.story.status, '/project/:id/story/:storyId/status', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({
        params: typed<{ id: string, storyId: string }>(ConnectStoryParamsSchema),
      }, typed<ConnectStoryStatus>())
    ),

    },

    // --- generated files and conversion ----------------------------------------------------
    // One file at one path — read, written whole, deleted — under the owned base and no payment
    // gate, exactly like the web editor's routes. A write and a delete rebuild the preview.
    files: {
    list: protocol(
      route(connect.files.list, '/project/:id/files', { parent: base, method: RouteMethod.GET }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<string[]>()),
    ),
    get: protocol(
      route(connect.files.get, '/project/:id/files/content', { parent: base, method: RouteMethod.GET }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        query: typed<ConnectFileQuery>(ConnectFileQuerySchema),
      }, typed<ConnectFileContent>()),
    ),
    save: protocol(
      route(connect.files.save, '/project/:id/files/content', { parent: base, method: RouteMethod.POST }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        body: typed<ConnectFileSaveBody>(ConnectFileSaveBodySchema),
      }, typed<ConnectFileWritten>()),
    ),
    remove: protocol(
      route(connect.files.remove, '/project/:id/files/content', { parent: base, method: RouteMethod.DELETE }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        query: typed<ConnectFileQuery>(ConnectFileQuerySchema),
      }, typed<ConnectFileWritten>()),
    ),
    meta: protocol(
      route(connect.files.meta, '/project/:id/files/meta', { parent: base, method: RouteMethod.GET }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        query: typed<ConnectFileMetaQuery>(ConnectFileMetaQuerySchema),
      }, typed<string[]>()),
    ),
    // The preview tree's changes by cursor — the web editor's watch socket, polled.
    changes: protocol(
      route(connect.files.changes, '/project/:id/files/changes', { parent: base, method: RouteMethod.GET }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        query: typed<ConnectFeedQuery>(ConnectFeedQuerySchema),
      }, typed<ConnectFileChanges>()),
    ),
    },

    // --- the preview workload and the organization's workloads -----------------------------
    // The web's sandbox controls: each answers the preview workload as it then stands. Nothing is
    // spent, so the owned base alone.
    sandbox: {
    run: protocol(
      route(connect.sandbox.run, '/project/:id/sandbox/run', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectSlotView>()),
    ),
    restart: protocol(
      route(connect.sandbox.restart, '/project/:id/sandbox/restart', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectSlotView>()),
    ),
    stop: protocol(
      route(connect.sandbox.stop, '/project/:id/sandbox/stop', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectSlotView>()),
    ),
    rebuild: protocol(
      route(connect.sandbox.rebuild, '/project/:id/sandbox/rebuild', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectSlotView>()),
    ),
    },

    slot: {
    list: protocol(
      route(connect.slot.list, '/slot', { parent: base, method: RouteMethod.GET }),
      contract(typed<ConnectSlotView[]>()),
    ),
    },

    // --- git and GitHub ---------------------------------------------------------------------
    // The web Git dialog's own calls, under the owned base and no payment gate — nothing is spent.
    // GitHub is AUTHORIZED here (the answer is the address the person opens) and never completed:
    // GitHub returns to the platform's web application, which completes it. No answer carries the
    // GitHub token.
    git: {
    status: protocol(
      route(connect.git.status, '/project/:id/git', { parent: base, method: RouteMethod.GET }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectGitState>()),
    ),
    log: protocol(
      route(connect.git.log, '/project/:id/git/log', { parent: base, method: RouteMethod.GET }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectGitCommit[]>()),
    ),
    commit: protocol(
      route(connect.git.commit, '/project/:id/git/commit', { parent: base, method: RouteMethod.POST }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        body: typed<ConnectGitCommitBody>(ConnectGitCommitBodySchema),
      }, typed<ConnectGitCommitResult>()),
    ),
    discard: protocol(
      route(connect.git.discard, '/project/:id/git/discard', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectGitStatus>()),
    ),
    revert: protocol(
      route(connect.git.revert, '/project/:id/git/revert', { parent: base, method: RouteMethod.POST }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        body: typed<ConnectGitRevertBody>(ConnectGitRevertBodySchema),
      }, typed<ConnectGitRevertResult>()),
    ),
    },

    github: {
    authorize: protocol(
      route(connect.github.authorize, '/project/:id/github/authorize', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectGithubAuthorize>()),
    ),
    publish: protocol(
      route(connect.github.publish, '/project/:id/github/publish', { parent: base, method: RouteMethod.POST }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        body: typed<ConnectGithubPublishBody>(ConnectGithubPublishBodySchema),
      }, typed<ConnectGithubConnection>()),
    ),
    push: protocol(
      route(connect.github.push, '/project/:id/github/push', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectGitSyncResult>()),
    ),
    pull: protocol(
      route(connect.github.pull, '/project/:id/github/pull', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectGitSyncResult>()),
    ),
    disconnect: protocol(
      route(connect.github.disconnect, '/project/:id/github/disconnect', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectGithubDisconnected>()),
    ),
    repos: protocol(
      route(connect.github.repos, '/project/:id/github/repos', { parent: base, method: RouteMethod.GET }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        query: typed<ConnectGithubRepoQuery>(ConnectGithubRepoQuerySchema),
      }, typed<ConnectGithubRepoList>()),
    ),
    branches: protocol(
      route(connect.github.branches, '/project/:id/github/branches', { parent: base, method: RouteMethod.GET }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        query: typed<ConnectGithubBranchQuery>(ConnectGithubBranchQuerySchema),
      }, typed<ConnectGithubBranchList>()),
    ),
    link: protocol(
      route(connect.github.link, '/project/:id/github/link', { parent: base, method: RouteMethod.POST }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        body: typed<ConnectGithubLinkBody>(ConnectGithubLinkBodySchema),
      }, typed<ConnectGithubLinked>()),
    ),
    },

    // --- the production workload ----------------------------------------------------------
    // The web Publish dialog's own calls. Each carries exactly its browser twin's payment gate: a
    // publish holds a published-sites unit (the LIMIT gate), attaching a custom domain and the
    // standalone sign-in are capabilities; the status, restart, stop, verify and detach are owned
    // calls alone (a restart of a stopped site takes its unit in the handler, as the browser's does).
    production: {
    status: protocol(
      route(connect.production.status, '/project/:id/production', { parent: base, method: RouteMethod.GET }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectProductionStatus>()),
    ),
    publish: protocol(
      route(connect.production.publish, '/project/:id/production/publish', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectProductionStatus>()),
      paidGate(ConnectPaidGate.PublishedSites),
    ),
    restart: protocol(
      route(connect.production.restart, '/project/:id/production/restart', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectProductionStatus>()),
    ),
    stop: protocol(
      route(connect.production.stop, '/project/:id/production/stop', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectProductionStatus>()),
    ),
    domain: {
      attach: protocol(
        route(connect.production.domain.attach, '/project/:id/production/domain/attach', { parent: base, method: RouteMethod.POST }),
        contract.request({
          params: typed<{ id: string }>(ConnectProjectIdSchema),
          body: typed<ConnectProductionDomainBody>(ConnectProductionDomainBodySchema),
        }, typed<ConnectProductionDomain | null>()),
        paidGate(ConnectPaidGate.CustomDomain),
      ),
      verify: protocol(
        route(connect.production.domain.verify, '/project/:id/production/domain/verify', { parent: base, method: RouteMethod.POST }),
        contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectProductionDomain | null>()),
      ),
      detach: protocol(
        route(connect.production.domain.detach, '/project/:id/production/domain/detach', { parent: base, method: RouteMethod.POST }),
        contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectProductionDomain | null>()),
      ),
    },
    auth: {
      get: protocol(
        route(connect.production.auth.get, '/project/:id/production/auth', { parent: base, method: RouteMethod.GET }),
        contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectProductionAuth>()),
        paidGate(ConnectPaidGate.ProductionStandalone),
      ),
      redirects: protocol(
        route(connect.production.auth.redirects, '/project/:id/production/auth/redirects', { parent: base, method: RouteMethod.POST }),
        contract.request({
          params: typed<{ id: string }>(ConnectProjectIdSchema),
          body: typed<ConnectProductionRedirectsBody>(ConnectProductionRedirectsBodySchema),
        }, typed<ConnectProductionRedirects>()),
        paidGate(ConnectPaidGate.ProductionStandalone),
      ),
    },
    },

    convert: {
    create: protocol(
      route(connect.convert.create, '/convert', { parent: base, method: RouteMethod.POST }),
      contract.request({ body: typed<ConnectConvertCreateBody>(ConnectConvertCreateBodySchema) }, typed<ConversionStatusView>()),
    ),
    check: protocol(
      route(connect.convert.check, '/convert/:id/check', { parent: base, method: RouteMethod.GET }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConvertCheck>()),
    ),
    start: protocol(
      route(connect.convert.start, '/convert/:id/start', { parent: base, method: RouteMethod.POST }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        body: typed<ConnectConvertStartBody>(ConnectConvertStartBodySchema),
      }, typed<ConversionStatusView>()),
    ),
    proceed: protocol(
      route(connect.convert.proceed, '/convert/:id/proceed', { parent: base, method: RouteMethod.POST }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        body: typed<ConnectConvertProceedBody>(ConnectConvertProceedBodySchema),
      }, typed<ConversionStatusView>()),
    ),
    status: protocol(
      route(connect.convert.status, '/convert/:id', { parent: base, method: RouteMethod.GET }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConversionStatusView>()),
    ),
    purge: protocol(
      route(connect.convert.purge, '/convert/:id/purge', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConversionStatusView>()),
    ),
    },

    inquiry: {
    answer: protocol(
      route(connect.inquiry.answer, '/project/:id/inquiry/:inquiryId', {
        parent: base, method: RouteMethod.POST,
      }),
      contract.request({
        params: typed<{ id: string, inquiryId: string }>(ConnectInquiryParamsSchema),
        body: typed<ConnectInquiryAnswerBody>(InquiryAnswerSchema),
      }, typed()),
    ),
    },

    // --- the generated app's sign-in (its IAM) ----------------------------------------------
    // The owner console's own calls, per project and per app (`scope`: the preview's client by
    // default, or production's), under the ownership gate alone — exactly their browser twins'
    // (`back.iam.*`). The bodies are the browser's own schemas; every write is a POST, a remove's
    // `scope` rides in its body; a read takes it in the query. No staff-synchronization twin.
    iam: {
    permissions: protocol(
      route(connect.iam.permissions, '/project/:id/iam/permissions', { parent: base, method: RouteMethod.GET }),
      contract.request({ ...projectParams, ...scopeQuery }, typed<IamPermissionsResponse>()),
    ),
    defaultUpdate: protocol(
      route(connect.iam.defaultUpdate, '/project/:id/iam/permissions/default', { parent: base, method: RouteMethod.POST }),
      contract.request({ ...projectParams, body: typed<IamDefinitionUpdate>(IamDefinitionUpdateSchema) }, typed<IamPermissionDefinition>()),
    ),
    grants: {
      list: protocol(
        route(connect.iam.grants.list, '/project/:id/iam/grants', { parent: base, method: RouteMethod.GET }),
        contract.request({ ...projectParams, query: typed<IamGrantsQuery>(IamGrantsQuerySchema) }, typed<IamGrantsResponse>()),
      ),
      assign: protocol(
        route(connect.iam.grants.assign, '/project/:id/iam/grants', { parent: base, method: RouteMethod.POST }),
        contract.request({ ...projectParams, body: typed<IamAssignGrant>(IamAssignGrantSchema) }, typed<IamGrant>()),
      ),
      revoke: protocol(
        route(connect.iam.grants.revoke, '/project/:id/iam/grants/revoke', { parent: base, method: RouteMethod.POST }),
        contract.request({ ...projectParams, body: typed<IamRevokeGrant>(IamRevokeGrantSchema) }, typed<undefined>()),
      ),
    },
    users: {
      list: protocol(
        route(connect.iam.users.list, '/project/:id/iam/users', { parent: base, method: RouteMethod.GET }),
        contract.request({ ...projectParams, ...scopeQuery }, typed<IamUsersResponse>()),
      ),
      invite: protocol(
        route(connect.iam.users.invite, '/project/:id/iam/users', { parent: base, method: RouteMethod.POST }),
        contract.request({ ...projectParams, body: typed<IamProjectUserInvite>(IamProjectUserInviteSchema) }, typed<IamUser>()),
      ),
      update: protocol(
        route(connect.iam.users.update, '/project/:id/iam/users/:profileId', { parent: base, method: RouteMethod.POST }),
        contract.request({ ...userParams, body: typed<IamProjectUserUpdate>(IamProjectUserUpdateSchema) }, typed<IamUser>()),
      ),
      remove: protocol(
        route(connect.iam.users.remove, '/project/:id/iam/users/:profileId/remove', { parent: base, method: RouteMethod.POST }),
        contract.request({ ...userParams, ...scopedBody }, typed<undefined>()),
      ),
    },
    organizations: {
      list: protocol(
        route(connect.iam.organizations.list, '/project/:id/iam/organizations', { parent: base, method: RouteMethod.GET }),
        contract.request({ ...projectParams, ...scopeQuery }, typed<IamOrganizationsResponse>()),
      ),
      update: protocol(
        route(connect.iam.organizations.update, organization, { parent: base, method: RouteMethod.POST }),
        contract.request({ ...organizationParams, body: typed<IamOrganizationEdit>(IamOrganizationEditSchema) }, typed<IamOrganization>()),
      ),
      members: protocol(
        route(connect.iam.organizations.members, `${organization}/members`, { parent: base, method: RouteMethod.GET }),
        contract.request({ ...organizationParams, ...scopeQuery }, typed<IamMembersResponse>()),
      ),
      addMember: protocol(
        route(connect.iam.organizations.addMember, `${organization}/members`, { parent: base, method: RouteMethod.POST }),
        contract.request({ ...organizationParams, body: typed<IamProjectMemberInvite>(IamProjectMemberInviteSchema) }, typed<IamMember>()),
      ),
      updateMember: protocol(
        route(connect.iam.organizations.updateMember, `${organization}/members/:profileId`, { parent: base, method: RouteMethod.POST }),
        contract.request({ ...memberParams, body: typed<IamProjectMemberUpdate>(IamProjectMemberUpdateSchema) }, typed<IamMember>()),
      ),
      removeMember: protocol(
        route(connect.iam.organizations.removeMember, `${organization}/members/:profileId/remove`, { parent: base, method: RouteMethod.POST }),
        contract.request({ ...memberParams, ...scopedBody }, typed<undefined>()),
      ),
    },
    groups: {
      list: protocol(
        route(connect.iam.groups.list, `${organization}/groups`, { parent: base, method: RouteMethod.GET }),
        contract.request({ ...organizationParams, ...scopeQuery }, typed<IamGroupsResponse>()),
      ),
      ensure: protocol(
        route(connect.iam.groups.ensure, `${organization}/groups`, { parent: base, method: RouteMethod.POST }),
        contract.request({ ...organizationParams, body: typed<IamGroupCreate>(IamGroupCreateSchema) }, typed<IamGroup>()),
      ),
      update: protocol(
        route(connect.iam.groups.update, group, { parent: base, method: RouteMethod.POST }),
        contract.request({ ...groupParams, body: typed<IamGroupEdit>(IamGroupEditSchema) }, typed<IamGroup>()),
      ),
      remove: protocol(
        route(connect.iam.groups.remove, `${group}/remove`, { parent: base, method: RouteMethod.POST }),
        contract.request({ ...groupParams, ...scopedBody }, typed<undefined>()),
      ),
      members: protocol(
        route(connect.iam.groups.members, `${group}/members`, { parent: base, method: RouteMethod.GET }),
        contract.request({ ...groupParams, ...scopeQuery }, typed<IamMembersResponse>()),
      ),
      addMembers: protocol(
        route(connect.iam.groups.addMembers, `${group}/members`, { parent: base, method: RouteMethod.POST }),
        contract.request({ ...groupParams, body: typed<IamGroupMembersChange>(IamGroupMembersChangeSchema) }, typed<undefined>()),
      ),
      removeMembers: protocol(
        route(connect.iam.groups.removeMembers, `${group}/members/remove`, { parent: base, method: RouteMethod.POST }),
        contract.request({ ...groupParams, body: typed<IamGroupMembersChange>(IamGroupMembersChangeSchema) }, typed<undefined>()),
      ),
    },
    },

    // --- pipelines -------------------------------------------------------------------------
    pipeline: {
    state: protocol(
      route(connect.pipeline.state, '/pipeline/:id/:runId', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<ConnectPipelineParams>(ConnectPipelineParamsSchema) }, typed<ConnectPipelineState>())
    ),
    resume: protocol(
      route(connect.pipeline.resume, '/pipeline/:id/:runId/resume', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<ConnectPipelineParams>(ConnectPipelineParamsSchema), body: typed<ConnectPipelineResumeBody>(ConnectPipelineResumeBodySchema) }, typed<ConnectPipelineState>())
    ),
    },

    // --- request now, collect later --------------------------------------------------------
    // A delegated write answered `{ pending }` is collected here by its `x-viable-call` id: a long
    // poll under the base guard and never the paid gate — collecting is not a new use of anything.
    call: {
    collect: protocol(
      route(connect.call.collect, '/call/:callId', { parent: base, method: RouteMethod.GET }),
      contract.request({
        params: typed<ConnectCallCollectParams>(ConnectCallCollectParamsSchema),
        query: typed<ConnectCallCollectQuery>(ConnectCallCollectQuerySchema),
      }, typed<ConnectCallResult>()),
    ),
    },
  }
}
