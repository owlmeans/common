import type { PlanningFacade } from '@owlmeans/planning'
import type {
  StackCatalogue, ConnectAccessTokenList, ConnectAccessTokenRevoked, ConnectIntentPickup, ConnectPrivacyChoices,
  ConnectProfileSettingsView, ConnectProjectSettings,
  ConnectAgentLock, ConnectBrandingBackfill, ConnectCapabilities, ConnectClientView, ConnectConfigSaveBody, ConnectConfigScope,
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
  AgentSteerArgs, AgentSteerResult, AgentStopArgs, WorkcardBatchStartArgs, WorkcardBatchView,
  ConnectCreateWithMaterialsBody, ConnectMaterialCatalogue, ConnectMaterialsState, ConnectMaterialText,
  ConnectAppAddBody, ConnectAppRestartBody, ConnectAppsChangeView, ConnectAppsView, ConnectAreaAddBody, ConnectAreaBindBody,
  ConnectCardStatus, ConnectCardsPlanView, ConnectCardsRerunBody, ConnectCardsRerunView, ConnectCardsRunAllBody, ConnectCardsTogetherBody,
  ConnectCardsTogetherView,
  ConnectRequestView, ViableImplementChoice,
  ConnectCreateWithChoiceBody, ConnectConvertCreateWithChoiceBody, ConnectProjectStructure, ConnectStructureSubmitBody,
} from '@owlmeans/viable-common'
import type { UploadInput, UploadInputResult, UploadRunOptions } from '@owlmeans/client-upload'
import type { UploadSession } from '@owlmeans/upload'

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

/** How an upload of a project's files runs: inputs in flight at once, retries, progress, abort. */
export interface MaterialsUploadOptions extends Pick<UploadRunOptions, 'concurrency' | 'retries' | 'onProgress' | 'signal'> {}

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
    /**
     * `create`, with the prompt's references read by the platform (`connect.project.createWithReferences`):
     * its links — pages, public S3 objects, public Google Drive folders — fetched, its "search online"
     * requests researched and the npm packages it names screened before the drafting. A platform older
     * than the route answers 404 (the tools then fall back to `create`).
     */
    createWithReferences: (prompt: string, target?: ConnectTarget, sessionId?: string) => Promise<ConnectProjectStatus>
    confirm: (projectId: string, edits: ProjectEdits) => Promise<ConnectProjectStatus>
    /**
     * `confirm`, with the references the confirmed specification adds fetched and researched before the
     * files are placed (`connect.project.confirmWithReferences`). A platform older than the route answers
     * 404 (the tools then fall back to `confirm`).
     */
    confirmWithReferences: (projectId: string, edits: ProjectEdits) => Promise<ConnectProjectStatus>
    /**
     * `confirmWithReferences` with the choice at the specification approval
     * (`connect.project.confirmImplementation`): `preview` draws the application only, `spec` also
     * implements the init's spec right away — asked of the spec gate at the confirm, so a Free plan
     * without topped-up credits is refused (`ConnectOutOfCredits`). A platform older than the route
     * answers 404 (the tool then says the choice is not offered yet — never a silent preview).
     */
    confirmImplementation: (projectId: string, edits: ProjectImplementEdits) => Promise<ConnectProjectStatus>
    /**
     * A create with the person's choice made BEFORE the specification (`connect.project.createWithChoice`):
     * the blueprint, the case and its category, a bot's platforms, the tenancy flags (each absent is Auto),
     * whether to stop at the structure step, and — for a create with files — the announcement
     * (`materials.upload` then sends them). The prompt's references are read. Optional: an implementation
     * written before it has none, and a platform older than the route answers 404 — the tools then refuse
     * and create nothing, never dropping the choice.
     */
    createWithChoice?: (body: ConnectCreateWithChoiceBody) => Promise<ConnectProjectStatus>
    /**
     * The project's structure (`connect.project.structure.get`): the structure step's record while a
     * creation or a conversion is at it, the project card's after the initialization. Optional, like
     * {@link createWithChoice}.
     */
    structure?: (projectId: string) => Promise<ConnectProjectStructure>
    /**
     * Submit the structure step (`connect.project.structure.submit`) — over the revision read; an advice
     * round (`advise`, ideas) is refused with `ConnectConfirmationRequired` unless `confirm`. Optional, like
     * {@link createWithChoice}.
     */
    submitStructure?: (projectId: string, body: ConnectStructureSubmitBody) => Promise<ConnectProjectStructure>
    list: () => Promise<Array<{ id: string, name: string, alias: string }>>
    status: (projectId: string) => Promise<ConnectProjectStatus>
    attach: (args: { projectId?: string, slug?: string }) => Promise<ConnectProjectStatus>
    reinit: (projectId: string) => Promise<ConnectProjectStatus>
    modify: (projectId: string, prompt: string) => Promise<ConnectProjectStatus>
    /**
     * A person's request in words, triaged first (`connect.project.request`): a question is answered by
     * reading, a small fix made at once (free flight), anything bigger filed as cards of the right type
     * as the person's own — and started on request once the agent lets go of the project. Answers what
     * it became. A platform older than the route answers 404 (the tool then falls back to `modify`).
     */
    request: (projectId: string, prompt: string) => Promise<ConnectRequestView>
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
     * Stop what the agent runs now — the web's Stop. A story run stops at its next step boundary and
     * its changes since that run started are rolled back (the story returns to planned); an
     * open-ended change stops once the model's current answer arrives and ends with a short summary,
     * its edits kept; the `batch` scope cancels the batch first. Answers the lock, `stopping` set.
     * Refused `AgentNotRunning` when nothing it reaches runs.
     */
    stop: (projectId: string, args: AgentStopArgs) => Promise<ConnectAgentLock>
    /**
     * Send the open-ended change that runs now a message, read before the agent's next model call.
     * Refused `AgentNotRunning` when no such run is open to messages.
     */
    steer: (projectId: string, args: AgentSteerArgs) => Promise<AgentSteerResult>
    /**
     * A story batch — the web's Run all: several planned stories implemented one after another, in
     * the order the platform chooses for building them.
     */
    batch: {
      /**
       * Start one over the stories named (card ids), or every planned story when `stories` is left
       * out. Refused `WorkcardBatchActive` while another runs, `WorkcardBatchEmpty` when nothing planned is
       * selected; each story's start is admitted like a person's Start.
       */
      start: (projectId: string, args: WorkcardBatchStartArgs) => Promise<WorkcardBatchView>
      /** The project's latest batch, or `null` when none ever ran. */
      get: (projectId: string) => Promise<WorkcardBatchView | null>
      /** No further story starts; the story in progress is stopped through {@link stop}. */
      cancel: (projectId: string) => Promise<WorkcardBatchView>
    }
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
    /**
     * The project's applications: `main` alone for a project without an apps record, every app of a
     * split one — each with its mount and areas and, for a cloud preview, its interface build and
     * server. A local project answers the map alone. A platform older than the route answers 404.
     */
    apps: (projectId: string) => Promise<ConnectAppsView>
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
    /** Installed blueprint and case catalogue; available before any project exists. */
    blueprints: () => Promise<StackCatalogue>
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
    status: (projectId: string, workcardId: string) => Promise<ConnectStoryStatus>
  }

  /**
   * Work cards of every type — what planning cannot answer alone. The cards themselves are read and
   * written through {@link planning}; a platform older than these routes answers 404.
   */
  cards: {
    /** One card composed: its members, plan, open proposals, a task's inputs (set or missing — never a value) and its run. */
    status: (projectId: string, cardId: string) => Promise<ConnectCardStatus>
    /**
     * Run together: the selected cards (ids) become ONE new spec's members, started as the person's
     * Start when `start` says so (its gate's non-consuming check first).
     */
    together: (projectId: string, body: ConnectCardsTogetherBody) => Promise<ConnectCardsTogetherView>
    /** Run all's proposal: where each loose planned card would go. Nothing is written. */
    plan: (projectId: string) => Promise<ConnectCardsPlanView>
    /** Run all: the accepted assignment applied, then ONE batch — the existing specs first, the new spec next, the cards on their own last. */
    runAll: (projectId: string, body: ConnectCardsRunAllBody) => Promise<WorkcardBatchView>
    /**
     * A container's re-run: the spec or feature started as the person's Start for exactly its failed
     * (`failed`) or its unfinished (`unfinished`) members — the container's gate, spending credits.
     */
    rerun: (projectId: string, body: ConnectCardsRerunBody) => Promise<ConnectCardsRerunView>
  }

  /**
   * A NEW project's files ("materials"): a create that waits for them, their upload — only where the
   * connector reads a disk — sealed (which starts the drafting from the prompt and the files), the
   * drafting asked again, and the two reads every host has: the catalogue and one material's text.
   */
  materials: {
    /**
     * Create a project announcing the files about to be uploaded (`materials: { files, bytes }`, what
     * the precheck accepted). The same answer as `project.create`; nothing is drafted until the upload
     * is sealed. `sessionId` names the caller's unattached delegated session, as for `project.create`.
     */
    create: (body: ConnectCreateWithMaterialsBody) => Promise<ConnectProjectStatus>
    /**
     * Send files into the project's upload (its session is the project): prechecked against the
     * session's policy, `concurrency` at a time, one result per input in order — the server's
     * decision per file (an archive answers the files it unpacked), a precheck refusal, or the
     * failure that remained after the retries. Refused `SdkUnsupported` where no disk is read.
     */
    upload: (projectId: string, inputs: UploadInput[], opts?: MaterialsUploadOptions) => Promise<UploadInputResult[]>
    /** Take one uploaded file back out before the upload is sealed (`fileId` = the upload's own id of it). */
    remove: (projectId: string, fileId: string) => Promise<UploadSession>
    /** Every file is in: the upload is sealed and the drafting starts. */
    seal: (projectId: string) => Promise<UploadSession>
    /**
     * Ask for the drafting again — `force`: an upload still open is sealed first (Continue with what
     * arrived), a draft that failed runs again (Retry). Answers where the files stand.
     */
    draft: (projectId: string, force?: boolean) => Promise<ConnectMaterialsState>
    /** Every file of the project — accepted, rejected and removed — with its purpose and status. */
    catalogue: (projectId: string) => Promise<ConnectMaterialCatalogue>
    /** One material's text: its transcript, else a textual file's own text, cut at `CONNECT_MATERIAL_TEXT_MAX`. */
    read: (projectId: string, path: string) => Promise<ConnectMaterialText>
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
    /**
     * Restart ONE application of the preview — its server, and with `web` its interface build —
     * while the others and the worker keep serving; answers the apps as they then stand. Refused for
     * an app the preview does not serve (`slot-app:unknown:<name>`), by a preview runtime that
     * predates apps (`slot-app:restart-unsupported` — restart the whole preview) and while the agent
     * holds the project.
     */
    restartApp: (projectId: string, app: string, args?: ConnectAppRestartBody) => Promise<ConnectAppsView>
  }

  /**
   * The project's APP STRUCTURE, changed by the person: an app added (taking over areas, or created
   * with a new home area), an area of the project's own added to an app, an area moved to another app.
   * Each runs free flight's app checks and applies as one short run under the project lock — the
   * platform update first, the rebuild last — and answers the apps as they then stand with what
   * changed. Refused as `slot-app:change-refused:<sentence>` (nothing changed) and while the agent
   * holds the project. Optional: an implementation written before it (a platform older than the
   * routes answers 404) offers no structural change.
   */
  apps?: {
    add: (projectId: string, body: ConnectAppAddBody) => Promise<ConnectAppsChangeView>
    addArea: (projectId: string, body: ConnectAreaAddBody) => Promise<ConnectAppsChangeView>
    bindArea: (projectId: string, body: ConnectAreaBindBody) => Promise<ConnectAppsChangeView>
  }

  /** The organization's workloads, every project and kind (preview, production, local). */
  slot: {
    list: () => Promise<ConnectSlotView[]>
  }

  /**
   * How the platform sees this connection: the edition its `x-viable-client` header named, the door
   * it came through and whether it may perform the platform's model calls. `null` from a platform
   * older than the route (it answers 404); every other failure is thrown like any other call's.
   */
  client: () => Promise<ConnectClientView | null>

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
   * managed here too. An IAM refusal the owner can act on (the staff group's members, bundles or
   * existence, a managed definition, the last owner) is `IamRefused` (`iam-refused:<marker>`); a
   * backend that keeps a listing in a console of its own answers it empty with `external: true`.
   * Organizations travel by slug, groups by key.
   */
  iam: {
    /** Every end user of every app the organization owns — read-only; a person is managed per project. */
    organizationUsers: () => Promise<IamUsersResponse>
    /** The app's permission definitions and its tenancy flags. */
    permissions: (projectId: string, scope?: ConnectConfigScope) => Promise<IamPermissionsResponse>
    /** A definition's default class or organization binding; an omitted setting is kept. */
    setDefault: (projectId: string, body: IamDefinitionUpdate) => Promise<IamPermissionDefinition>
    grants: {
      /**
       * Every grant, one person's (`profileId`) or one group's (`group` with its `entitySlug`) — what
       * is held, plus the inherited grants a subject's own restriction withholds (`restricted: true`).
       */
      list: (projectId: string, query?: IamGrantsQuery) => Promise<IamGrantsResponse>
      /** Grant to exactly one subject — a person or a group. */
      assign: (projectId: string, body: IamAssignGrant) => Promise<IamGrant>
      /** A whole-permission revoke restricts the subject; `mode: inherit` takes its own value back. */
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
    /**
     * `create` with the person's blueprint, case and its category, a bot's platforms and the tenancy flags
     * (`connect.convert.createWithChoice`), settled at import. Optional: without it (or on a platform that
     * answers 404) a conversion asked with a choice is refused, never filed without it.
     */
    createWithChoice?: (args: ConnectConvertCreateWithChoiceBody) => Promise<ConversionStatusView>
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

/** {@link ProjectEdits} and the choice at the specification approval — the `confirmImplementation` body. */
export interface ProjectImplementEdits extends ProjectEdits {
  implement: ViableImplementChoice
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
  /**
   * Whether the task's deadline passed before it was answered: the platform withdrew it, so it is
   * neither handed out nor named any more, and an answer to it would settle nothing.
   */
  taskWithdrawn?: (taskId: string) => boolean
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
