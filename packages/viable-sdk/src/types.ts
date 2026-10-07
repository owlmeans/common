import type { PlanningFacade } from '@owlmeans/planning'
import type {
  ConnectAccessTokenList, ConnectAccessTokenRevoked, ConnectIntentPickup, ConnectPrivacyChoices,
  ConnectProfileSettingsView, ConnectProjectSettings,
  ConnectAgentLock, ConnectBrandingBackfill, ConnectCapabilities, ConnectConfigSaveBody, ConnectConfigScope,
  ConnectOrganizationBranding, ConnectOrganizationBrandingSave, ConnectProjectConfig, ConnectConvertCreateBody, ConnectConvertProceedBody, ConnectConvertStartBody,
  ConnectFileContent, ConnectFileMetaQuery, ConnectFileWritten, ConnectSlotView,
  ConnectGitCommit, ConnectGitCommitResult, ConnectGitRevertResult, ConnectGitState, ConnectGitStatus, ConnectGitSyncResult,
  ConnectGithubAuthorize, ConnectGithubBranchList, ConnectGithubBranchQuery, ConnectGithubConnection,
  ConnectGithubDisconnected, ConnectGithubLinkBody, ConnectGithubLinked, ConnectGithubPublishBody, ConnectGithubRepoList,
  ConnectGithubRepoQuery, ConnectProductionAuth, ConnectProductionDomain, ConnectProductionRedirects,
  ConnectProductionStatus,
  ConnectHarness, ConnectKitApplyBody, ConnectKitApplyResult, ConnectKitDescribe,
  ConnectLlm, ConnectMarker, ConnectOp, ConnectOpResult, ConnectOpSubmission, ConnectPipelineState,
  ConnectProjectBranding, ConnectProjectBrandingSave, ConnectProjectStatus, ConnectProjectSummary, ConnectSessionView,
  ConnectStoryStatus, ConnectTarget,
  ConversionStatusView, ConvertCheck, InquiryAnswerPayload, InquiryPayload, ModelTask,
  ModelTaskResult, SlotCommandPayload,
  IamAssignGrant, IamDefinitionUpdate, IamGrant, IamGrantsQuery, IamGrantsResponse, IamGroup, IamGroupCreate,
  IamGroupEdit, IamGroupsResponse, IamMember, IamMembersResponse, IamOrganization, IamOrganizationEdit,
  IamOrganizationsResponse, IamPermissionDefinition, IamPermissionsResponse, IamProjectMemberInvite,
  IamProjectMemberUpdate, IamProjectUserInvite, IamProjectUserUpdate, IamRevokeGrant, IamUser, IamUsersResponse,
  ConnectActivityQuery, ConnectFeedPage, ConnectFeedQuery, ConnectFileChanges,
} from '@owlmeans/viable-common'

export interface SdkOptions {
  apiUrl: string
  /** The access token. The connector authenticates with nothing else. */
  token: string
  target: ConnectTarget
  llm: ConnectLlm
  harness: ConnectHarness
  /** The directory a local target lives in. Required when `target` is local. */
  projectDir?: string
  clientVersion?: string
  /** Where the connector's own diagnostics go. NEVER stdout for a stdio MCP server. */
  log?: (line: string) => void
}

/**
 * Everything the connector can ask the platform for.
 *
 * An interface rather than a class because there are two implementations that must stay
 * interchangeable: one that calls the API over HTTP (what the npx server does) and one that calls
 * the manager's own handlers in process (what the URL-configured MCP host does). Every tool is
 * written against this, so a tool cannot accidentally work in only one of the two.
 */
export interface ConnectorApi {
  openSession: (args: OpenSessionArgs) => Promise<ConnectSessionView>
  closeSession: (sessionId: string) => Promise<void>
  pullOps: (sessionId: string, waitSec: number) => Promise<ConnectOp[]>
  submitOp: (sessionId: string, result: ConnectOpResult) => Promise<ConnectOpSubmission>

  project: {
    /**
     * `sessionId`: the caller's UNATTACHED delegated session — its parent performs the checks the
     * platform runs before the project card exists. Absent, the platform performs them.
     */
    create: (prompt: string, target?: ConnectTarget, sessionId?: string) => Promise<ConnectProjectStatus>
    confirm: (projectId: string, edits: ProjectEdits) => Promise<ConnectProjectStatus>
    list: () => Promise<Array<{ id: string, name: string, alias: string }>>
    status: (projectId: string) => Promise<ConnectProjectStatus>
    attach: (args: { projectId?: string, slug?: string }) => Promise<ConnectProjectStatus>
    reinit: (projectId: string) => Promise<ConnectProjectStatus>
    modify: (projectId: string, prompt: string) => Promise<ConnectProjectStatus>
    /**
     * Rename the project: its record, specification, vision and what its code calls it. The web
     * address stays. A new name starts an agent run, paid like an open-ended change.
     */
    rename: (projectId: string, name: string, description?: string) => Promise<ConnectProjectStatus>
    /**
     * The planning kits the project can take: ready sets of card types and status flows, each
     * for one kind of work-management product.
     */
    kitDescribe: (projectId: string) => Promise<ConnectKitDescribe>
    /**
     * Write one kit's card types and flows into the project's common package (`types` keeps only
     * those type keys). The platform rebuilds the preview itself; the answer says what was written.
     */
    kitApply: (projectId: string, body: ConnectKitApplyBody) => Promise<ConnectKitApplyResult>
    /**
     * Delete the project and everything it owns — its preview and production workloads, its
     * stories and documents, its configuration and its connector sessions. Cannot be undone; the
     * answer names what was deleted.
     */
    destroy: (projectId: string) => Promise<ConnectProjectSummary>
    /**
     * Release the project's agent lock by force — the recovery for a lock a crashed run left
     * behind. A run still working is not stopped by it; the answer is the lock as it now stands.
     */
    unlock: (projectId: string) => Promise<ConnectAgentLock>
    /**
     * What the project's agent did after a cursor — run starts and stops, pipeline steps, card,
     * workload and conversion changes, git proposals, tool outcomes, and with `detail: thinking` the
     * model's own words. Held up to `wait` seconds (at most 20) when nothing came yet; `gap` says
     * entries after the cursor were dropped. The browser's project socket, polled.
     */
    activity: (projectId: string, query?: ConnectActivityQuery) => Promise<ConnectFeedPage>
    /**
     * The project's inference override (`null` inherits the person's preference), what it resolves
     * to and whether the plan allows the delegated mode.
     */
    llm: (projectId: string) => Promise<ConnectProjectSettings>
    /**
     * Pin the project's inference mode, or `null` to inherit the person's preference again — a
     * capability of the plan: refused `CapabilityRequired` when the plan has no delegated mode
     * (clearing an override included, exactly as in the browser). It is the DEFAULT the
     * URL-configured host and the browser use; a stdio connector already running keeps its `--llm`.
     */
    setLlm: (projectId: string, llmMode: ConnectLlm | null) => Promise<ConnectProjectSettings>
  }

  /**
   * The project settings a person edits on the project's control panel: the copyright line, the
   * organization name, the Terms and Privacy links and the Google tag — and, read-only, where the
   * platform credit stands (`credit`).
   *
   * Read and written as ONE record, because the platform validates them as one — a save merges the
   * patch over what is stored, checks and moderates the merged record exactly as the web save does,
   * and answers with it. `scope` names the production workload's own set; absent, the preview's.
   */
  projectBranding: (projectId: string, scope?: ConnectConfigScope) => Promise<ConnectProjectBranding>
  /**
   * Change some of the project settings; the fields left out keep their stored values.
   *
   * The platform applies a change of the preview's set by a configuration push (which rebuilds it);
   * production takes it at the next Publish. For a local target that push is a `Configure`
   * operation, so the caller attaches its connector first.
   */
  saveProjectBranding: (projectId: string, patch: ConnectProjectBrandingSave, scope?: ConnectConfigScope) => Promise<ConnectProjectBranding>
  /**
   * Hide (`true`) or show the platform credit — white label, a capability of the plan: refused
   * `CapabilityRequired` when the plan does not include it. Answers the settings with the credit.
   */
  setPlatformCredit: (projectId: string, hidden: boolean, scope?: ConnectConfigScope) => Promise<ConnectProjectBranding>
  /** Replace the project's organization name and copyright with the organization's defaults. */
  copyOrganizationBranding: (projectId: string, scope?: ConnectConfigScope) => Promise<ConnectProjectBranding>

  /**
   * The project's configuration variables — what its generated application reads from its
   * environment. A backend variable's value is a secret and never comes back: only whether it is set.
   */
  config: {
    get: (projectId: string, scope?: ConnectConfigScope) => Promise<ConnectProjectConfig>
    /** Set the variables named (a patch); a save of the preview's set reconfigures and rebuilds it. */
    save: (projectId: string, body: ConnectConfigSaveBody, scope?: ConnectConfigScope) => Promise<ConnectProjectConfig>
    /** Let the platform's agent read the sources again for the variables they declare. */
    recollect: (projectId: string) => Promise<ConnectProjectConfig>
  }

  /** The organization's own records. */
  account: {
    /** The organization's branding defaults — what every new project starts with. */
    branding: {
      get: () => Promise<ConnectOrganizationBranding>
      save: (patch: ConnectOrganizationBrandingSave) => Promise<ConnectOrganizationBranding>
      /** Fill the projects' blank branding rows from the defaults; answers how many changed. */
      backfill: () => Promise<ConnectBrandingBackfill>
    }
    /**
     * The person's own inference preference — the default of every project without an override.
     * `set` is a capability of the plan (refused `CapabilityRequired` without the delegated mode).
     */
    llm: {
      get: () => Promise<ConnectProfileSettingsView>
      set: (llmMode: ConnectLlm) => Promise<ConnectProfileSettingsView>
    }
    /** The person's own access tokens: listed and revoked — never created through the connector. */
    tokens: {
      list: () => Promise<ConnectAccessTokenList>
      /** Revoke one of the person's own tokens (this connector's own included); idempotent. */
      revoke: (tokenId: string) => Promise<ConnectAccessTokenRevoked>
    }
    /** The person's own marketing consents: read, and withdrawn — never granted. */
    privacy: {
      status: () => Promise<ConnectPrivacyChoices>
      /** Write `granted: false` for each key; an unknown key refuses the whole call. */
      withdraw: (keys: string[]) => Promise<ConnectPrivacyChoices>
    }
    /** A prompt stashed on the public site, collected ONCE by its reference. */
    intent: {
      pickup: (ref: string) => Promise<ConnectIntentPickup>
    }
    /** The organization's notices after a cursor, held up to `wait` seconds — the browser's toasts. */
    notifications: (query?: ConnectFeedQuery) => Promise<ConnectFeedPage>
  }

  story: {
    status: (projectId: string, storyId: string) => Promise<ConnectStoryStatus>
  }

  /**
   * The platform's planning surface: projects, user stories and the documents behind them as
   * cards, and every change to one as a transition.
   *
   * The story tools read and write through it. The scope it answers for is the CREDENTIAL's —
   * the platform takes the organization, the profile and the channel from the token (over HTTP)
   * or from the caller it authenticated (in process), never from anything a tool sends.
   */
  planning: PlanningFacade

  /**
   * A cloud target's generated tree — the web editor's reads and writes. Paths are relative to the
   * project root, as `list` prints them.
   */
  files: {
    list: (projectId: string) => Promise<string[]>
    /** One file's content. */
    get: (projectId: string, path: string) => Promise<ConnectFileContent>
    /**
     * Replace one file's whole content (a new path creates it). The content is checked like the web
     * editor's save and the preview is rebuilt; a build that failed is named on `buildWarning`, and
     * the write stands either way. A file that decides how the project builds and starts is refused.
     */
    save: (projectId: string, path: string, content: string) => Promise<ConnectFileWritten>
    /** Delete one file, then rebuild the preview — `buildWarning` as for {@link save}. */
    remove: (projectId: string, path: string) => Promise<ConnectFileWritten>
    /** The project's metadata documents of one kind: stories, specifications, or all of them. */
    meta: (projectId: string, query: ConnectFileMetaQuery) => Promise<string[]>
    /**
     * The preview tree's file changes after a cursor, held up to `wait` seconds; the read starts the
     * preview's watcher when it is not running yet (`watching` says whether it runs).
     */
    changes: (projectId: string, query?: ConnectFeedQuery) => Promise<ConnectFileChanges>
  }

  /**
   * The project's PREVIEW workload — the web's sandbox controls; each answers the workload as it
   * then stands. A cloud target only: a local project's process is the user's own.
   */
  sandbox: {
    /** Start the preview (provisioning it first when it has none). */
    run: (projectId: string) => Promise<ConnectSlotView>
    restart: (projectId: string) => Promise<ConnectSlotView>
    stop: (projectId: string) => Promise<ConnectSlotView>
    /**
     * Reinstall the dependencies and rebuild — the repair for a preview that will not build. It runs
     * on after the answer, holding the project's agent lock until it is done.
     */
    rebuild: (projectId: string) => Promise<ConnectSlotView>
  }

  /** The organization's workloads, every project and kind (preview, production, local). */
  slot: {
    list: () => Promise<ConnectSlotView[]>
  }

  /**
   * A cloud target's git repository — the web Git dialog's own calls. Every write waits while an
   * agent run holds the project (`git-busy`); a revert is a NEW commit, history is never rewritten.
   */
  git: {
    /**
     * The project's GitHub connection and its working tree — `git` is `null` while the preview is not
     * ready (reading git there would start a stopped preview).
     */
    status: (projectId: string) => Promise<ConnectGitState>
    /** The latest commits, newest first. */
    log: (projectId: string) => Promise<ConnectGitCommit[]>
    /** Commit every change of the working tree; `commit` is `null` when there was nothing to commit. */
    commit: (projectId: string, message: string) => Promise<ConnectGitCommitResult>
    /** Throw away every uncommitted change; answers the clean tree. */
    discard: (projectId: string) => Promise<ConnectGitStatus>
    /** Go back to one earlier commit's tree as a new commit, then rebuild the preview. */
    revert: (projectId: string, hash: string) => Promise<ConnectGitRevertResult>
  }

  /**
   * The project's GitHub connection. `authorize` answers the address the PERSON opens: GitHub returns
   * to the platform's web application, which completes the connection — nothing here completes it.
   * The GitHub token is never answered.
   */
  github: {
    authorize: (projectId: string) => Promise<ConnectGithubAuthorize>
    /** Publish to a new repository or an existing one; push and pull work from then on. */
    publish: (projectId: string, body: ConnectGithubPublishBody) => Promise<ConnectGithubConnection>
    push: (projectId: string) => Promise<ConnectGitSyncResult>
    pull: (projectId: string) => Promise<ConnectGitSyncResult>
    /** Forget the connection — the repository on GitHub is left as it is. */
    disconnect: (projectId: string) => Promise<ConnectGithubDisconnected>
    /** One page of the person's repositories. */
    repos: (projectId: string, query?: ConnectGithubRepoQuery) => Promise<ConnectGithubRepoList>
    /** One page of one repository's branches. */
    branches: (projectId: string, query: ConnectGithubBranchQuery) => Promise<ConnectGithubBranchList>
    /** Record which repository an imported project came FROM — nothing is pushed or published. */
    link: (projectId: string, body: ConnectGithubLinkBody) => Promise<ConnectGithubLinked>
  }

  /**
   * A cloud target's PRODUCTION workload — the web Publish dialog's own calls; never the preview.
   * A publish holds a published-sites unit of the plan (`LimitExhausted` when it has no room), a
   * custom domain and the standalone sign-in are paid capabilities (`CapabilityRequired`). The
   * sign-in's client secret is never answered: `auth` says whether one is set.
   */
  production: {
    /** The production workload (`null` before the first publish) and its domain. */
    status: (projectId: string) => Promise<ConnectProductionStatus>
    /** Build and deploy the current sources as the published site; it goes live after the answer. */
    publish: (projectId: string) => Promise<ConnectProductionStatus>
    /** Restart the site — a stopped one is redeployed, and takes a published-sites unit again. */
    restart: (projectId: string) => Promise<ConnectProductionStatus>
    /** Stop the site and give its published-sites unit back; its data is kept. */
    stop: (projectId: string) => Promise<ConnectProductionStatus>
    domain: {
      /** Attach a custom domain; answers the DNS records the owner creates. */
      attach: (projectId: string, domain: string) => Promise<ConnectProductionDomain | null>
      /** Ask the provider again whether the records are in place. */
      verify: (projectId: string) => Promise<ConnectProductionDomain | null>
      /** Detach the custom domain; the generated address keeps serving. */
      detach: (projectId: string) => Promise<ConnectProductionDomain | null>
    }
    /** The standalone sign-in configuration — never its secret. */
    auth: (projectId: string) => Promise<ConnectProductionAuth>
    /** Replace the standalone redirect addresses; applied on the next publish. */
    setRedirects: (projectId: string, redirects: string[]) => Promise<ConnectProductionRedirects>
  }

  /**
   * The generated app's sign-in — the owner console's own calls, per project and per app: `scope`
   * picks the preview's client (absent) or production's. Platform records, so a local target's app is
   * managed here too. An IAM refusal the owner can act on (a managed group or definition, the last
   * owner) is `IamRefused` (`iam-refused:<marker>`); a backend that keeps a listing in a console of
   * its own answers it empty with `external: true`. Organizations travel by slug, groups by key.
   */
  iam: {
    /** Every end user of every app the organization owns — read-only; a person is managed per project. */
    organizationUsers: () => Promise<IamUsersResponse>
    /** The app's permission definitions and its tenancy flags. */
    permissions: (projectId: string, scope?: ConnectConfigScope) => Promise<IamPermissionsResponse>
    /** A definition's default class or organization binding; an omitted setting is kept. */
    setDefault: (projectId: string, body: IamDefinitionUpdate) => Promise<IamPermissionDefinition>
    grants: {
      /** Every grant, one person's (`profileId`) or one group's (`group` with its `entitySlug`). */
      list: (projectId: string, query?: IamGrantsQuery) => Promise<IamGrantsResponse>
      /** Grant to exactly one subject — a person or a group. */
      assign: (projectId: string, body: IamAssignGrant) => Promise<IamGrant>
      revoke: (projectId: string, body: IamRevokeGrant) => Promise<void>
    }
    users: {
      list: (projectId: string, scope?: ConnectConfigScope) => Promise<IamUsersResponse>
      /** Find-or-create, by e-mail. */
      invite: (projectId: string, body: IamProjectUserInvite) => Promise<IamUser>
      update: (projectId: string, profileId: string, body: IamProjectUserUpdate) => Promise<IamUser>
      /** Remove from this app only — the account and its other apps stay. */
      remove: (projectId: string, profileId: string, scope?: ConnectConfigScope) => Promise<void>
    }
    organizations: {
      list: (projectId: string, scope?: ConnectConfigScope) => Promise<IamOrganizationsResponse>
      /** Retitle; the slug stays. */
      update: (projectId: string, entitySlug: string, body: IamOrganizationEdit) => Promise<IamOrganization>
      members: (projectId: string, entitySlug: string, scope?: ConnectConfigScope) => Promise<IamMembersResponse>
      addMember: (projectId: string, entitySlug: string, body: IamProjectMemberInvite) => Promise<IamMember>
      updateMember: (
        projectId: string, entitySlug: string, profileId: string, body: IamProjectMemberUpdate,
      ) => Promise<IamMember>
      removeMember: (projectId: string, entitySlug: string, profileId: string, scope?: ConnectConfigScope) => Promise<void>
    }
    groups: {
      list: (projectId: string, entitySlug: string, scope?: ConnectConfigScope) => Promise<IamGroupsResponse>
      /** Find-or-create by key. */
      ensure: (projectId: string, entitySlug: string, body: IamGroupCreate) => Promise<IamGroup>
      /** Title and the WHOLE bundle list (it replaces the group's); an omitted field is kept. */
      update: (projectId: string, entitySlug: string, group: string, body: IamGroupEdit) => Promise<IamGroup>
      remove: (projectId: string, entitySlug: string, group: string, scope?: ConnectConfigScope) => Promise<void>
      members: (projectId: string, entitySlug: string, group: string, scope?: ConnectConfigScope) => Promise<IamMembersResponse>
      addMembers: (
        projectId: string, entitySlug: string, group: string, profileIds: string[], scope?: ConnectConfigScope,
      ) => Promise<void>
      removeMembers: (
        projectId: string, entitySlug: string, group: string, profileIds: string[], scope?: ConnectConfigScope,
      ) => Promise<void>
    }
  }

  pipeline: {
    state: (projectId: string, runId: string) => Promise<ConnectPipelineState>
    resume: (projectId: string, runId: string, args?: { from?: string, force?: boolean }) => Promise<ConnectPipelineState>
  }

  /**
   * Bringing an application the platform did not generate onto its rails.
   *
   * State-changing verbs return the conversion's current domain status. Long-running work remains
   * server-side and is observed through `status`; broker records are never part of this API.
   */
  convert: {
    create: (args: ConnectConvertCreateBody) => Promise<ConversionStatusView>
    check: (projectId: string) => Promise<ConvertCheck>
    /** `body.confirm`: a person agreed to what the start uses (`ConnectConfirmationRequired` otherwise). */
    start: (projectId: string, body?: ConnectConvertStartBody) => Promise<ConversionStatusView>
    proceed: (projectId: string, body: ConnectConvertProceedBody) => Promise<ConversionStatusView>
    status: (projectId: string) => Promise<ConversionStatusView>
    purge: (projectId: string) => Promise<ConversionStatusView>
  }

  /**
   * Answering a question by its own id.
   *
   * The fallback path, and never the first one: while a connector holds the question it answers
   * the OPERATION it arrived on, which is what the platform is actually waiting for. This is for a
   * run that parked while nobody was attached — its operation has timed out, and the question is
   * then reachable only through the project it belongs to.
   */
  inquiry: {
    answer: (projectId: string, inquiryId: string, answer: InquiryAnswerPayload) => Promise<unknown>
  }
}

export interface OpenSessionArgs {
  projectId?: string
  projectDir?: string
  target: ConnectTarget
  llm: ConnectLlm
  harness: ConnectHarness
  clientVersion: string
  capabilities: ConnectCapabilities
}

export interface ProjectEdits {
  name?: string
  description?: string
  specification?: string
  vision?: string
  designSystem?: string
  target?: ConnectTarget
}

/** What a connector executes locally. Absent for a cloud target — the platform's pod does it. */
export interface LocalExecutor {
  execute: (payload: SlotCommandPayload) => Promise<unknown>
  dir: string
}

/**
 * One attached session, running.
 *
 * It owns the loop: operations arrive, the executor answers them, model tasks queue up for the
 * parent agent to drain. Everything a tool needs to know about "what is happening right now" is
 * on `stats`, which is also what a test uses to tell a working run from a stalled one.
 */
export interface SessionRuntime {
  session: ConnectSessionView
  stats: SessionStats
  /**
   * The next model task for the parent agent, or null if none arrives within the wait or the
   * signal aborts. Among queued tasks, the one that expires first.
   */
  nextTask: (waitMs: number, signal?: AbortSignal) => Promise<ModelTask | null>
  /**
   * Whether a model task is queued, waiting up to `waitMs` for one; takes nothing. What a tool
   * blocked on a platform call races that call against.
   */
  taskAvailable: (waitMs: number, signal?: AbortSignal) => Promise<boolean>
  /** A task already handed out and not yet answered — what an answer is checked against. */
  taskById: (taskId: string) => ModelTask | null
  /** Handed to the parent and still unanswered, oldest first. */
  outstandingTasks: () => ModelTask[]
  /** Hand back what the parent agent's subagent produced. */
  submitTask: (result: ModelTaskResult) => Promise<void>
  /** How many tasks are waiting right now. */
  pendingTasks: () => number
  /**
   * The next question for the person the parent agent is working for, or null within the wait.
   *
   * A separate queue from the tasks and drained by a separate tool, because the two are answered
   * by different parties on entirely different timescales — and a question that reached a
   * subagent would be answered by a model, which is the one outcome asking exists to avoid.
   */
  nextQuestion: (waitMs: number) => Promise<InquiryPayload | null>
  /** A question already put to the parent and not yet answered — what an answer is checked against. */
  questionById: (inquiryId: string) => InquiryPayload | null
  /** Put to the parent and still unanswered, oldest first. */
  outstandingQuestions: () => InquiryPayload[]
  /** Hand back what the person decided. */
  answerQuestion: (answer: InquiryAnswerPayload) => Promise<void>
  /** How many questions are waiting right now. */
  pendingQuestions: () => number
  close: () => Promise<void>
}

export interface SessionStats {
  opsDone: number
  opsFailed: number
  tasksDelivered: number
  tasksSubmitted: number
  questionsDelivered: number
  questionsAnswered: number
  lastActivityAt: number
  /** How the connector is currently receiving operations: by long poll, or not at all once closed. */
  transport: 'pull' | 'none'
}

export interface SdkMarker extends ConnectMarker {}
