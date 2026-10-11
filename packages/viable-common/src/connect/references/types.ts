import type { BlueprintCatalogue } from '../../blueprint/catalogue/types.js'
import type {
  ConnectAccessTokenList, ConnectAccessTokenParams, ConnectAccessTokenRevoked, ConnectBrandingBackfill, ConnectIntentPickup,
  ConnectIntentPickupBody, ConnectOrganizationBranding, ConnectOrganizationBrandingSave, ConnectPrivacyChoices,
  ConnectPrivacyWithdrawBody,
} from '../account/types.js'
import type { ConnectBrandingCreditBody, ConnectProjectBranding, ConnectProjectBrandingSave } from '../branding/types.js'
import type { ConnectConfigSaveBody, ConnectProjectConfig, ConnectScopeQuery } from '../config/types.js'
import type { ConnectCallCollectParams, ConnectCallCollectQuery, ConnectCallResult } from '../call/types.js'
import type {
  ConnectConvertCreateBody, ConnectConvertProceedBody, ConnectConvertStartBody, ConversionStatusView, ConvertCheck
} from '../conversion/types.js'
import type {
  ConnectFileContent, ConnectFileMetaQuery, ConnectFileQuery, ConnectFileSaveBody, ConnectFileWritten,
} from '../files/types.js'
import type {
  ConnectGitCommit, ConnectGitCommitBody, ConnectGitCommitResult, ConnectGitRevertBody, ConnectGitRevertResult,
  ConnectGitState, ConnectGitStatus, ConnectGitSyncResult, ConnectGithubAuthorize, ConnectGithubBranchList,
  ConnectGithubBranchQuery, ConnectGithubConnection, ConnectGithubDisconnected, ConnectGithubLinkBody, ConnectGithubLinked,
  ConnectGithubPublishBody, ConnectGithubRepoList, ConnectGithubRepoQuery,
} from '../git/types.js'
import type { ConnectKitApplyBody, ConnectKitApplyResult, ConnectKitDescribe } from '../kit/types.js'
import type { ConnectActivityQuery, ConnectFeedPage, ConnectFeedQuery, ConnectFileChanges } from '../feed/types.js'
import type { ConnectInquiryAnswerBody, ConnectOp, ConnectOpResult, ConnectOpSubmission } from '../ops/types.js'
import type { ConnectPipelineParams, ConnectPipelineResumeBody, ConnectPipelineState } from '../pipeline/types.js'
import type {
  ConnectAgentLock, ConnectAttachBody, ConnectConfirmBody, ConnectCreateBody, ConnectModifyBody, ConnectRenameBody,
  ConnectProjectStatus, ConnectProjectSummary, ConnectStoryStatus
} from '../project/types.js'
import type {
  ConnectProductionAuth, ConnectProductionDomain, ConnectProductionDomainBody, ConnectProductionRedirects,
  ConnectProductionRedirectsBody, ConnectProductionStatus,
} from '../production/types.js'
import type { ConnectPullQuery, ConnectSessionOpen, ConnectSessionParams, ConnectSessionView } from '../session/types.js'
import type { ConnectSlotView } from '../slot/types.js'
import type { ConnectLlmBody, ConnectProfileSettingsView, ConnectProjectLlmBody, ConnectProjectSettings } from '../settings/types.js'
import type {
  ConnectIamGroupParams, ConnectIamMemberParams, ConnectIamOrganizationParams, ConnectIamUserParams,
} from '../iam/types.js'
import type {
  IamAssignGrant, IamDefinitionUpdate, IamGrant, IamGrantsQuery, IamGrantsResponse, IamGroup, IamGroupCreate,
  IamGroupEdit, IamGroupMembersChange, IamGroupsResponse, IamMember, IamMembersResponse, IamOrganization,
  IamOrganizationEdit, IamOrganizationsResponse, IamPermissionDefinition, IamPermissionsResponse,
  IamProjectMemberInvite, IamProjectMemberUpdate, IamProjectUserInvite, IamProjectUserUpdate, IamRevokeGrant,
  IamScoped, IamUsersResponse, IamUser,
} from '../../iam-console/types.js'
import type { ConnectReference } from './types.local.js'

export interface ConnectReferences {
  account: {
    blueprints: ConnectReference<{}, BlueprintCatalogue>
    branding: {
      get: ConnectReference<{}, ConnectOrganizationBranding>
      save: ConnectReference<{ body: ConnectOrganizationBrandingSave }, ConnectOrganizationBranding>
      backfill: ConnectReference<{}, ConnectBrandingBackfill>
    }
    llm: {
      get: ConnectReference<{}, ConnectProfileSettingsView>
      set: ConnectReference<{ body: ConnectLlmBody }, ConnectProfileSettingsView>
    }
    tokens: {
      list: ConnectReference<{}, ConnectAccessTokenList>
      revoke: ConnectReference<{ params: ConnectAccessTokenParams }, ConnectAccessTokenRevoked>
    }
    privacy: {
      status: ConnectReference<{}, ConnectPrivacyChoices>
      withdraw: ConnectReference<{ body: ConnectPrivacyWithdrawBody }, ConnectPrivacyChoices>
    }
    intent: {
      pickup: ConnectReference<{ body: ConnectIntentPickupBody }, ConnectIntentPickup>
    }
    iam: {
      users: ConnectReference<{}, IamUsersResponse>
    }
    notifications: ConnectReference<{ query?: ConnectFeedQuery }, ConnectFeedPage>
  }
  session: {
    open: ConnectReference<{ body: ConnectSessionOpen }, ConnectSessionView>
    openDelegated: ConnectReference<{ body: ConnectSessionOpen }, ConnectSessionView>
    close: ConnectReference<{ params: ConnectSessionParams }, ConnectSessionView>
  }
  op: {
    pull: ConnectReference<{ params: ConnectSessionParams, query: ConnectPullQuery }, ConnectOp[]>
    submit: ConnectReference<{
      params: { sessionId: string, opId: string }, body: ConnectOpResult
    }, ConnectOpSubmission>
  }
  project: {
    create: ConnectReference<{ body: ConnectCreateBody }, ConnectProjectStatus>
    confirm: ConnectReference<{ params: { id: string }, body: ConnectConfirmBody }, ConnectProjectStatus>
    list: ConnectReference<{}, ConnectProjectSummary[]>
    status: ConnectReference<{ params: { id: string } }, ConnectProjectStatus>
    attach: ConnectReference<{ body: ConnectAttachBody }, ConnectProjectStatus>
    reinit: ConnectReference<{ params: { id: string } }, ConnectProjectStatus>
    modify: ConnectReference<{ params: { id: string }, body: ConnectModifyBody }, ConnectProjectStatus>
    rename: ConnectReference<{ params: { id: string }, body: ConnectRenameBody }, ConnectProjectStatus>
    destroy: ConnectReference<{ params: { id: string } }, ConnectProjectSummary>
    unlock: ConnectReference<{ params: { id: string } }, ConnectAgentLock>
    activity: ConnectReference<{ params: { id: string }, query?: ConnectActivityQuery }, ConnectFeedPage>
    llm: {
      get: ConnectReference<{ params: { id: string } }, ConnectProjectSettings>
      set: ConnectReference<{ params: { id: string }, body: ConnectProjectLlmBody }, ConnectProjectSettings>
    }
    kit: {
      describe: ConnectReference<{ params: { id: string } }, ConnectKitDescribe>
      apply: ConnectReference<{ params: { id: string }, body: ConnectKitApplyBody }, ConnectKitApplyResult>
    }
    branding: {
      get: ConnectReference<{ params: { id: string }, query?: ConnectScopeQuery }, ConnectProjectBranding>
      save: ConnectReference<{
        params: { id: string }, query?: ConnectScopeQuery, body: ConnectProjectBrandingSave
      }, ConnectProjectBranding>
      credit: ConnectReference<{
        params: { id: string }, query?: ConnectScopeQuery, body: ConnectBrandingCreditBody
      }, ConnectProjectBranding>
      copyDefaults: ConnectReference<{ params: { id: string }, query?: ConnectScopeQuery }, ConnectProjectBranding>
    }
  }
  config: {
    get: ConnectReference<{ params: { id: string }, query?: ConnectScopeQuery }, ConnectProjectConfig>
    save: ConnectReference<{
      params: { id: string }, query?: ConnectScopeQuery, body: ConnectConfigSaveBody
    }, ConnectProjectConfig>
    recollect: ConnectReference<{ params: { id: string } }, ConnectProjectConfig>
  }
  story: {
    status: ConnectReference<{ params: { id: string, storyId: string } }, ConnectStoryStatus>
  }
  files: {
    list: ConnectReference<{ params: { id: string } }, string[]>
    get: ConnectReference<{ params: { id: string }, query: ConnectFileQuery }, ConnectFileContent>
    save: ConnectReference<{ params: { id: string }, body: ConnectFileSaveBody }, ConnectFileWritten>
    remove: ConnectReference<{ params: { id: string }, query: ConnectFileQuery }, ConnectFileWritten>
    meta: ConnectReference<{ params: { id: string }, query: ConnectFileMetaQuery }, string[]>
    changes: ConnectReference<{ params: { id: string }, query?: ConnectFeedQuery }, ConnectFileChanges>
  }
  sandbox: {
    run: ConnectReference<{ params: { id: string } }, ConnectSlotView>
    restart: ConnectReference<{ params: { id: string } }, ConnectSlotView>
    stop: ConnectReference<{ params: { id: string } }, ConnectSlotView>
    rebuild: ConnectReference<{ params: { id: string } }, ConnectSlotView>
  }
  slot: {
    list: ConnectReference<{}, ConnectSlotView[]>
  }
  git: {
    status: ConnectReference<{ params: { id: string } }, ConnectGitState>
    log: ConnectReference<{ params: { id: string } }, ConnectGitCommit[]>
    commit: ConnectReference<{ params: { id: string }, body: ConnectGitCommitBody }, ConnectGitCommitResult>
    discard: ConnectReference<{ params: { id: string } }, ConnectGitStatus>
    revert: ConnectReference<{ params: { id: string }, body: ConnectGitRevertBody }, ConnectGitRevertResult>
  }
  github: {
    authorize: ConnectReference<{ params: { id: string } }, ConnectGithubAuthorize>
    publish: ConnectReference<{ params: { id: string }, body: ConnectGithubPublishBody }, ConnectGithubConnection>
    push: ConnectReference<{ params: { id: string } }, ConnectGitSyncResult>
    pull: ConnectReference<{ params: { id: string } }, ConnectGitSyncResult>
    disconnect: ConnectReference<{ params: { id: string } }, ConnectGithubDisconnected>
    repos: ConnectReference<{ params: { id: string }, query?: ConnectGithubRepoQuery }, ConnectGithubRepoList>
    branches: ConnectReference<{ params: { id: string }, query: ConnectGithubBranchQuery }, ConnectGithubBranchList>
    link: ConnectReference<{ params: { id: string }, body: ConnectGithubLinkBody }, ConnectGithubLinked>
  }
  production: {
    status: ConnectReference<{ params: { id: string } }, ConnectProductionStatus>
    publish: ConnectReference<{ params: { id: string } }, ConnectProductionStatus>
    restart: ConnectReference<{ params: { id: string } }, ConnectProductionStatus>
    stop: ConnectReference<{ params: { id: string } }, ConnectProductionStatus>
    domain: {
      attach: ConnectReference<{ params: { id: string }, body: ConnectProductionDomainBody }, ConnectProductionDomain | null>
      verify: ConnectReference<{ params: { id: string } }, ConnectProductionDomain | null>
      detach: ConnectReference<{ params: { id: string } }, ConnectProductionDomain | null>
    }
    auth: {
      get: ConnectReference<{ params: { id: string } }, ConnectProductionAuth>
      redirects: ConnectReference<{ params: { id: string }, body: ConnectProductionRedirectsBody }, ConnectProductionRedirects>
    }
  }
  iam: {
    permissions: ConnectReference<{ params: { id: string }, query?: ConnectScopeQuery }, IamPermissionsResponse>
    defaultUpdate: ConnectReference<{ params: { id: string }, body: IamDefinitionUpdate }, IamPermissionDefinition>
    grants: {
      list: ConnectReference<{ params: { id: string }, query?: IamGrantsQuery }, IamGrantsResponse>
      assign: ConnectReference<{ params: { id: string }, body: IamAssignGrant }, IamGrant>
      revoke: ConnectReference<{ params: { id: string }, body: IamRevokeGrant }, undefined>
    }
    users: {
      list: ConnectReference<{ params: { id: string }, query?: ConnectScopeQuery }, IamUsersResponse>
      invite: ConnectReference<{ params: { id: string }, body: IamProjectUserInvite }, IamUser>
      update: ConnectReference<{ params: ConnectIamUserParams, body: IamProjectUserUpdate }, IamUser>
      remove: ConnectReference<{ params: ConnectIamUserParams, body: IamScoped }, undefined>
    }
    organizations: {
      list: ConnectReference<{ params: { id: string }, query?: ConnectScopeQuery }, IamOrganizationsResponse>
      update: ConnectReference<{ params: ConnectIamOrganizationParams, body: IamOrganizationEdit }, IamOrganization>
      members: ConnectReference<{ params: ConnectIamOrganizationParams, query?: ConnectScopeQuery }, IamMembersResponse>
      addMember: ConnectReference<{ params: ConnectIamOrganizationParams, body: IamProjectMemberInvite }, IamMember>
      updateMember: ConnectReference<{ params: ConnectIamMemberParams, body: IamProjectMemberUpdate }, IamMember>
      removeMember: ConnectReference<{ params: ConnectIamMemberParams, body: IamScoped }, undefined>
    }
    groups: {
      list: ConnectReference<{ params: ConnectIamOrganizationParams, query?: ConnectScopeQuery }, IamGroupsResponse>
      ensure: ConnectReference<{ params: ConnectIamOrganizationParams, body: IamGroupCreate }, IamGroup>
      update: ConnectReference<{ params: ConnectIamGroupParams, body: IamGroupEdit }, IamGroup>
      remove: ConnectReference<{ params: ConnectIamGroupParams, body: IamScoped }, undefined>
      members: ConnectReference<{ params: ConnectIamGroupParams, query?: ConnectScopeQuery }, IamMembersResponse>
      addMembers: ConnectReference<{ params: ConnectIamGroupParams, body: IamGroupMembersChange }, undefined>
      removeMembers: ConnectReference<{ params: ConnectIamGroupParams, body: IamGroupMembersChange }, undefined>
    }
  }
  convert: {
    create: ConnectReference<{ body: ConnectConvertCreateBody }, ConversionStatusView>
    check: ConnectReference<{ params: { id: string } }, ConvertCheck>
    start: ConnectReference<{ params: { id: string }, body: ConnectConvertStartBody }, ConversionStatusView>
    proceed: ConnectReference<{
      params: { id: string }, body: ConnectConvertProceedBody
    }, ConversionStatusView>
    status: ConnectReference<{ params: { id: string } }, ConversionStatusView>
    purge: ConnectReference<{ params: { id: string } }, ConversionStatusView>
  }
  inquiry: {
    answer: ConnectReference<{
      params: { id: string, inquiryId: string }, body: ConnectInquiryAnswerBody
    }, unknown>
  }
  pipeline: {
    state: ConnectReference<{ params: ConnectPipelineParams }, ConnectPipelineState>
    resume: ConnectReference<{
      params: ConnectPipelineParams, body: ConnectPipelineResumeBody
    }, ConnectPipelineState>
  }
  call: {
    collect: ConnectReference<{
      params: ConnectCallCollectParams, query: ConnectCallCollectQuery
    }, ConnectCallResult>
  }
}
