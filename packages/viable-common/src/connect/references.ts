import type { BlueprintCatalogue } from '../blueprint/catalogue/types.js'
import { entrypointRef } from '@owlmeans/entrypoint'
import { connect } from './consts.js'
import type {
  ConnectAccessTokenList, ConnectAccessTokenParams, ConnectAccessTokenRevoked, ConnectBrandingBackfill, ConnectIntentPickup,
  ConnectIntentPickupBody, ConnectOrganizationBranding, ConnectOrganizationBrandingSave, ConnectPrivacyChoices,
  ConnectPrivacyWithdrawBody,
} from './account/types.js'
import type { ConnectBrandingCreditBody, ConnectProjectBranding, ConnectProjectBrandingSave } from './branding/types.js'
import type { ConnectConfigSaveBody, ConnectProjectConfig, ConnectScopeQuery } from './config/types.js'
import type { ConnectCallCollectParams, ConnectCallCollectQuery, ConnectCallResult } from './call/types.js'
import type {
  ConnectConvertCreateBody, ConnectConvertProceedBody, ConnectConvertStartBody, ConversionStatusView, ConvertCheck
} from './conversion/types.js'
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
import type { ConnectInquiryAnswerBody, ConnectOp, ConnectOpResult, ConnectOpSubmission } from './ops/types.js'
import type { ConnectPipelineParams, ConnectPipelineResumeBody, ConnectPipelineState } from './pipeline/types.js'
import type {
  ConnectAgentLock, ConnectAttachBody, ConnectConfirmBody, ConnectCreateBody, ConnectModifyBody, ConnectRenameBody,
  ConnectProjectStatus, ConnectProjectSummary, ConnectStoryStatus
} from './project/types.js'
import type { ConnectReferences } from './references/types.js'
import type {
  ConnectIamGroupParams, ConnectIamMemberParams, ConnectIamOrganizationParams, ConnectIamUserParams,
} from './iam/types.js'
import type {
  IamAssignGrant, IamDefinitionUpdate, IamGrant, IamGrantsQuery, IamGrantsResponse, IamGroup, IamGroupCreate,
  IamGroupEdit, IamGroupMembersChange, IamGroupsResponse, IamMember, IamMembersResponse, IamOrganization,
  IamOrganizationEdit, IamOrganizationsResponse, IamPermissionDefinition, IamPermissionsResponse,
  IamProjectMemberInvite, IamProjectMemberUpdate, IamProjectUserInvite, IamProjectUserUpdate, IamRevokeGrant,
  IamScoped, IamUsersResponse, IamUser,
} from '../iam-console/types.js'
import type {
  ConnectProductionAuth, ConnectProductionDomain, ConnectProductionDomainBody, ConnectProductionRedirects,
  ConnectProductionRedirectsBody, ConnectProductionStatus,
} from './production/types.js'
import type { ConnectPullQuery, ConnectSessionOpen, ConnectSessionParams, ConnectSessionView } from './session/types.js'
import type { ConnectSlotView } from './slot/types.js'
import type { ConnectLlmBody, ConnectProfileSettingsView, ConnectProjectLlmBody, ConnectProjectSettings } from './settings/types.js'

/**
 * Typed references for adapter packages that address the connector dynamically.  Applications
 * export protocol objects instead; an adapter may use this compact form because it never exposes
 * aliases to UI or domain code.
 */
export const connectRef: ConnectReferences = {
  account: {
    blueprints: entrypointRef<{}, BlueprintCatalogue>(connect.account.blueprints),
    branding: {
      get: entrypointRef<{}, ConnectOrganizationBranding>(connect.account.branding.get),
      save: entrypointRef<{ body: ConnectOrganizationBrandingSave }, ConnectOrganizationBranding>(connect.account.branding.save),
      backfill: entrypointRef<{}, ConnectBrandingBackfill>(connect.account.branding.backfill),
    },
    llm: {
      get: entrypointRef<{}, ConnectProfileSettingsView>(connect.account.llm.get),
      set: entrypointRef<{ body: ConnectLlmBody }, ConnectProfileSettingsView>(connect.account.llm.set),
    },
    tokens: {
      list: entrypointRef<{}, ConnectAccessTokenList>(connect.account.tokens.list),
      revoke: entrypointRef<{ params: ConnectAccessTokenParams }, ConnectAccessTokenRevoked>(connect.account.tokens.revoke),
    },
    privacy: {
      status: entrypointRef<{}, ConnectPrivacyChoices>(connect.account.privacy.status),
      withdraw: entrypointRef<{ body: ConnectPrivacyWithdrawBody }, ConnectPrivacyChoices>(connect.account.privacy.withdraw),
    },
    intent: {
      pickup: entrypointRef<{ body: ConnectIntentPickupBody }, ConnectIntentPickup>(connect.account.intent.pickup),
    },
    iam: {
      users: entrypointRef<{}, IamUsersResponse>(connect.account.iam.users),
    },
    notifications: entrypointRef<{ query?: ConnectFeedQuery }, ConnectFeedPage>(connect.account.notifications),
  },
  session: {
    open: entrypointRef<{ body: ConnectSessionOpen }, ConnectSessionView>(connect.session.open),
    openDelegated: entrypointRef<{ body: ConnectSessionOpen }, ConnectSessionView>(connect.session.openDelegated),
    close: entrypointRef<{ params: ConnectSessionParams }, ConnectSessionView>(connect.session.close),
  },
  op: {
    pull: entrypointRef<{ params: ConnectSessionParams, query: ConnectPullQuery }, ConnectOp[]>(connect.op.pull),
    submit: entrypointRef<{
      params: { sessionId: string, opId: string }, body: ConnectOpResult
    }, ConnectOpSubmission>(connect.op.submit),
  },
  project: {
    create: entrypointRef<{ body: ConnectCreateBody }, ConnectProjectStatus>(connect.project.create),
    confirm: entrypointRef<{ params: { id: string }, body: ConnectConfirmBody }, ConnectProjectStatus>(connect.project.confirm),
    list: entrypointRef<{}, ConnectProjectSummary[]>(connect.project.list),
    status: entrypointRef<{ params: { id: string } }, ConnectProjectStatus>(connect.project.status),
    attach: entrypointRef<{ body: ConnectAttachBody }, ConnectProjectStatus>(connect.project.attach),
    reinit: entrypointRef<{ params: { id: string } }, ConnectProjectStatus>(connect.project.reinit),
    modify: entrypointRef<{ params: { id: string }, body: ConnectModifyBody }, ConnectProjectStatus>(connect.project.modify),
    rename: entrypointRef<{ params: { id: string }, body: ConnectRenameBody }, ConnectProjectStatus>(connect.project.rename),
    destroy: entrypointRef<{ params: { id: string } }, ConnectProjectSummary>(connect.project.destroy),
    unlock: entrypointRef<{ params: { id: string } }, ConnectAgentLock>(connect.project.unlock),
    activity: entrypointRef<{
      params: { id: string }, query?: ConnectActivityQuery
    }, ConnectFeedPage>(connect.project.activity),
    llm: {
      get: entrypointRef<{ params: { id: string } }, ConnectProjectSettings>(connect.project.llm.get),
      set: entrypointRef<{
        params: { id: string }, body: ConnectProjectLlmBody
      }, ConnectProjectSettings>(connect.project.llm.set),
    },
    kit: {
      describe: entrypointRef<{ params: { id: string } }, ConnectKitDescribe>(connect.project.kit.describe),
      apply: entrypointRef<{
        params: { id: string }, body: ConnectKitApplyBody
      }, ConnectKitApplyResult>(connect.project.kit.apply),
    },
    branding: {
      get: entrypointRef<{
        params: { id: string }, query?: ConnectScopeQuery
      }, ConnectProjectBranding>(connect.project.branding.get),
      save: entrypointRef<{
        params: { id: string }, query?: ConnectScopeQuery, body: ConnectProjectBrandingSave
      }, ConnectProjectBranding>(connect.project.branding.save),
      credit: entrypointRef<{
        params: { id: string }, query?: ConnectScopeQuery, body: ConnectBrandingCreditBody
      }, ConnectProjectBranding>(connect.project.branding.credit),
      copyDefaults: entrypointRef<{
        params: { id: string }, query?: ConnectScopeQuery
      }, ConnectProjectBranding>(connect.project.branding.copyDefaults),
    },
  },
  config: {
    get: entrypointRef<{ params: { id: string }, query?: ConnectScopeQuery }, ConnectProjectConfig>(connect.config.get),
    save: entrypointRef<{
      params: { id: string }, query?: ConnectScopeQuery, body: ConnectConfigSaveBody
    }, ConnectProjectConfig>(connect.config.save),
    recollect: entrypointRef<{ params: { id: string } }, ConnectProjectConfig>(connect.config.recollect),
  },
  story: {
    status: entrypointRef<{
      params: { id: string, storyId: string }
    }, ConnectStoryStatus>(connect.story.status),
  },
  convert: {
    create: entrypointRef<{ body: ConnectConvertCreateBody }, ConversionStatusView>(connect.convert.create),
    check: entrypointRef<{ params: { id: string } }, ConvertCheck>(connect.convert.check),
    start: entrypointRef<{
      params: { id: string }, body: ConnectConvertStartBody
    }, ConversionStatusView>(connect.convert.start),
    proceed: entrypointRef<{
      params: { id: string }, body: ConnectConvertProceedBody
    }, ConversionStatusView>(connect.convert.proceed),
    status: entrypointRef<{
      params: { id: string }
    }, ConversionStatusView>(connect.convert.status),
    purge: entrypointRef<{ params: { id: string } }, ConversionStatusView>(connect.convert.purge),
  },
  inquiry: {
    answer: entrypointRef<{
      params: { id: string, inquiryId: string }, body: ConnectInquiryAnswerBody
    }, unknown>(connect.inquiry.answer),
  },
  files: {
    list: entrypointRef<{ params: { id: string } }, string[]>(connect.files.list),
    get: entrypointRef<{ params: { id: string }, query: ConnectFileQuery }, ConnectFileContent>(connect.files.get),
    save: entrypointRef<{ params: { id: string }, body: ConnectFileSaveBody }, ConnectFileWritten>(connect.files.save),
    remove: entrypointRef<{ params: { id: string }, query: ConnectFileQuery }, ConnectFileWritten>(connect.files.remove),
    meta: entrypointRef<{ params: { id: string }, query: ConnectFileMetaQuery }, string[]>(connect.files.meta),
    changes: entrypointRef<{
      params: { id: string }, query?: ConnectFeedQuery
    }, ConnectFileChanges>(connect.files.changes),
  },
  sandbox: {
    run: entrypointRef<{ params: { id: string } }, ConnectSlotView>(connect.sandbox.run),
    restart: entrypointRef<{ params: { id: string } }, ConnectSlotView>(connect.sandbox.restart),
    stop: entrypointRef<{ params: { id: string } }, ConnectSlotView>(connect.sandbox.stop),
    rebuild: entrypointRef<{ params: { id: string } }, ConnectSlotView>(connect.sandbox.rebuild),
  },
  slot: {
    list: entrypointRef<{}, ConnectSlotView[]>(connect.slot.list),
  },
  git: {
    status: entrypointRef<{ params: { id: string } }, ConnectGitState>(connect.git.status),
    log: entrypointRef<{ params: { id: string } }, ConnectGitCommit[]>(connect.git.log),
    commit: entrypointRef<{ params: { id: string }, body: ConnectGitCommitBody }, ConnectGitCommitResult>(connect.git.commit),
    discard: entrypointRef<{ params: { id: string } }, ConnectGitStatus>(connect.git.discard),
    revert: entrypointRef<{ params: { id: string }, body: ConnectGitRevertBody }, ConnectGitRevertResult>(connect.git.revert),
  },
  github: {
    authorize: entrypointRef<{ params: { id: string } }, ConnectGithubAuthorize>(connect.github.authorize),
    publish: entrypointRef<{
      params: { id: string }, body: ConnectGithubPublishBody
    }, ConnectGithubConnection>(connect.github.publish),
    push: entrypointRef<{ params: { id: string } }, ConnectGitSyncResult>(connect.github.push),
    pull: entrypointRef<{ params: { id: string } }, ConnectGitSyncResult>(connect.github.pull),
    disconnect: entrypointRef<{ params: { id: string } }, ConnectGithubDisconnected>(connect.github.disconnect),
    repos: entrypointRef<{
      params: { id: string }, query?: ConnectGithubRepoQuery
    }, ConnectGithubRepoList>(connect.github.repos),
    branches: entrypointRef<{
      params: { id: string }, query: ConnectGithubBranchQuery
    }, ConnectGithubBranchList>(connect.github.branches),
    link: entrypointRef<{ params: { id: string }, body: ConnectGithubLinkBody }, ConnectGithubLinked>(connect.github.link),
  },
  production: {
    status: entrypointRef<{ params: { id: string } }, ConnectProductionStatus>(connect.production.status),
    publish: entrypointRef<{ params: { id: string } }, ConnectProductionStatus>(connect.production.publish),
    restart: entrypointRef<{ params: { id: string } }, ConnectProductionStatus>(connect.production.restart),
    stop: entrypointRef<{ params: { id: string } }, ConnectProductionStatus>(connect.production.stop),
    domain: {
      attach: entrypointRef<{
        params: { id: string }, body: ConnectProductionDomainBody
      }, ConnectProductionDomain | null>(connect.production.domain.attach),
      verify: entrypointRef<{ params: { id: string } }, ConnectProductionDomain | null>(connect.production.domain.verify),
      detach: entrypointRef<{ params: { id: string } }, ConnectProductionDomain | null>(connect.production.domain.detach),
    },
    auth: {
      get: entrypointRef<{ params: { id: string } }, ConnectProductionAuth>(connect.production.auth.get),
      redirects: entrypointRef<{
        params: { id: string }, body: ConnectProductionRedirectsBody
      }, ConnectProductionRedirects>(connect.production.auth.redirects),
    },
  },
  iam: {
    permissions: entrypointRef<{
      params: { id: string }, query?: ConnectScopeQuery
    }, IamPermissionsResponse>(connect.iam.permissions),
    defaultUpdate: entrypointRef<{
      params: { id: string }, body: IamDefinitionUpdate
    }, IamPermissionDefinition>(connect.iam.defaultUpdate),
    grants: {
      list: entrypointRef<{ params: { id: string }, query?: IamGrantsQuery }, IamGrantsResponse>(connect.iam.grants.list),
      assign: entrypointRef<{ params: { id: string }, body: IamAssignGrant }, IamGrant>(connect.iam.grants.assign),
      revoke: entrypointRef<{ params: { id: string }, body: IamRevokeGrant }, undefined>(connect.iam.grants.revoke),
    },
    users: {
      list: entrypointRef<{ params: { id: string }, query?: ConnectScopeQuery }, IamUsersResponse>(connect.iam.users.list),
      invite: entrypointRef<{ params: { id: string }, body: IamProjectUserInvite }, IamUser>(connect.iam.users.invite),
      update: entrypointRef<{ params: ConnectIamUserParams, body: IamProjectUserUpdate }, IamUser>(connect.iam.users.update),
      remove: entrypointRef<{ params: ConnectIamUserParams, body: IamScoped }, undefined>(connect.iam.users.remove),
    },
    organizations: {
      list: entrypointRef<{
        params: { id: string }, query?: ConnectScopeQuery
      }, IamOrganizationsResponse>(connect.iam.organizations.list),
      update: entrypointRef<{
        params: ConnectIamOrganizationParams, body: IamOrganizationEdit
      }, IamOrganization>(connect.iam.organizations.update),
      members: entrypointRef<{
        params: ConnectIamOrganizationParams, query?: ConnectScopeQuery
      }, IamMembersResponse>(connect.iam.organizations.members),
      addMember: entrypointRef<{
        params: ConnectIamOrganizationParams, body: IamProjectMemberInvite
      }, IamMember>(connect.iam.organizations.addMember),
      updateMember: entrypointRef<{
        params: ConnectIamMemberParams, body: IamProjectMemberUpdate
      }, IamMember>(connect.iam.organizations.updateMember),
      removeMember: entrypointRef<{
        params: ConnectIamMemberParams, body: IamScoped
      }, undefined>(connect.iam.organizations.removeMember),
    },
    groups: {
      list: entrypointRef<{
        params: ConnectIamOrganizationParams, query?: ConnectScopeQuery
      }, IamGroupsResponse>(connect.iam.groups.list),
      ensure: entrypointRef<{ params: ConnectIamOrganizationParams, body: IamGroupCreate }, IamGroup>(connect.iam.groups.ensure),
      update: entrypointRef<{ params: ConnectIamGroupParams, body: IamGroupEdit }, IamGroup>(connect.iam.groups.update),
      remove: entrypointRef<{ params: ConnectIamGroupParams, body: IamScoped }, undefined>(connect.iam.groups.remove),
      members: entrypointRef<{
        params: ConnectIamGroupParams, query?: ConnectScopeQuery
      }, IamMembersResponse>(connect.iam.groups.members),
      addMembers: entrypointRef<{
        params: ConnectIamGroupParams, body: IamGroupMembersChange
      }, undefined>(connect.iam.groups.addMembers),
      removeMembers: entrypointRef<{
        params: ConnectIamGroupParams, body: IamGroupMembersChange
      }, undefined>(connect.iam.groups.removeMembers),
    },
  },
  pipeline: {
    state: entrypointRef<{ params: ConnectPipelineParams }, ConnectPipelineState>(connect.pipeline.state),
    resume: entrypointRef<{
      params: ConnectPipelineParams, body: ConnectPipelineResumeBody
    }, ConnectPipelineState>(connect.pipeline.resume),
  },
  call: {
    collect: entrypointRef<{
      params: ConnectCallCollectParams, query: ConnectCallCollectQuery
    }, ConnectCallResult>(connect.call.collect),
  },
}
